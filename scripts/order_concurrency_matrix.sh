#!/usr/bin/env bash

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"
MONGO_CONTAINER="${MONGO_CONTAINER:-embe-mongodb}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/embe?directConnection=true}"
INITIAL_STOCK="${INITIAL_STOCK:-5}"
QTY_PER_ORDER="${QTY_PER_ORDER:-1}"
SCENARIOS="${SCENARIOS:-2,5,10}"
REPORT_DIR="${REPORT_DIR:-reports}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="${REPORT_DIR}/order_concurrency_${TIMESTAMP}.md"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd jq
require_cmd docker
require_cmd awk

if ! docker ps --format '{{.Names}}' | grep -qx "${MONGO_CONTAINER}"; then
  echo "Mongo container '${MONGO_CONTAINER}' is not running." >&2
  exit 1
fi

mkdir -p "${REPORT_DIR}"

mongo_eval() {
  local js="$1"
  docker exec "${MONGO_CONTAINER}" mongosh --quiet "${MONGO_URI}" --eval "${js}"
}

create_test_product() {
  local users="$1"
  local product_id="loadtest-${TIMESTAMP}-${users}-${RANDOM}"
  local sku="LOAD-${TIMESTAMP}-${users}-${RANDOM}"
  local js
  js=$(cat <<EOF
db.products.insertOne({
  _id: "${product_id}",
  name: "Load Test Product ${users} users",
  sku: "${sku}",
  category: "LOADTEST",
  price: NumberDecimal("1"),
  cost: NumberDecimal("1"),
  currentStock: NumberDecimal("${INITIAL_STOCK}"),
  active: true,
  images: [],
  createdAt: new Date(),
  updatedAt: new Date()
});
EOF
)
  mongo_eval "${js}" >/dev/null
  echo "${product_id}"
}

cleanup_test_data() {
  local product_id="$1"
  local js
  js=$(cat <<EOF
const pid = "${product_id}";
const orderIds = db.orders.find({"items.productId": pid}, {_id: 1}).toArray().map(x => x._id);
if (orderIds.length > 0) {
  db.audit_logs.deleteMany({module: "ORDER", entityId: {\$in: orderIds}});
}
db.product_stock_logs.deleteMany({productId: pid});
db.orders.deleteMany({"items.productId": pid});
db.products.deleteOne({_id: pid});
EOF
)
  mongo_eval "${js}" >/dev/null
}

run_scenario() {
  local users="$1"
  local product_id
  local tmp_dir
  local i

  product_id="$(create_test_product "${users}")"
  tmp_dir="$(mktemp -d)"

  for i in $(seq 1 "${users}"); do
    (
      local response_file="${tmp_dir}/resp_${i}.json"
      local code_file="${tmp_dir}/code_${i}.txt"
      local idempotency="load-${TIMESTAMP}-${users}-${i}-${RANDOM}"
      local phone_suffix
      local phone
      local payload
      local code

      phone_suffix="$(printf '%04d' "${i}")"
      phone="0900${phone_suffix}00"
      payload="{\"items\":[{\"productId\":\"${product_id}\",\"qty\":${QTY_PER_ORDER}}],\"recipientName\":\"Load User ${i}\",\"recipientPhone\":\"${phone}\",\"deliveryAddress\":\"Load test address ${users}\",\"note\":\"load-${TIMESTAMP}-${users}-${i}\"}"

      if code=$(curl -sS -o "${response_file}" -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "X-Idempotency-Key: ${idempotency}" \
        -X POST "${API_BASE}/api/orders" \
        -d "${payload}"); then
        echo "${code}" > "${code_file}"
      else
        echo "000" > "${code_file}"
        echo "{\"message\":\"curl_failed\"}" > "${response_file}"
      fi
    ) &
  done

  wait

  local success_count=0
  local conflict_count=0
  local other_count=0
  local other_messages=""

  for i in $(seq 1 "${users}"); do
    local code
    local response_file
    local message

    code="$(cat "${tmp_dir}/code_${i}.txt")"
    response_file="${tmp_dir}/resp_${i}.json"

    case "${code}" in
      200)
        success_count=$((success_count + 1))
        ;;
      409)
        conflict_count=$((conflict_count + 1))
        ;;
      *)
        other_count=$((other_count + 1))
        message="$(jq -r '.message // "unknown_error"' "${response_file}" 2>/dev/null || echo "unknown_error")"
        if [ -z "${other_messages}" ]; then
          other_messages="${message}"
        else
          other_messages="${other_messages}; ${message}"
        fi
        ;;
    esac
  done

  local final_stock_raw
  final_stock_raw="$(curl -fsS "${API_BASE}/api/products/public" | jq -r --arg id "${product_id}" '.[] | select(.id == $id) | .currentStock' | head -n 1)"
  if [ -z "${final_stock_raw}" ] || [ "${final_stock_raw}" = "null" ]; then
    final_stock_raw="0"
  fi

  local final_stock
  local expected_final
  local mismatch
  local oversell
  local result

  final_stock="$(awk -v v="${final_stock_raw}" 'BEGIN { printf "%.6f", v + 0 }')"
  expected_final="$(awk -v init="${INITIAL_STOCK}" -v ok="${success_count}" -v qty="${QTY_PER_ORDER}" 'BEGIN { printf "%.6f", init - (ok * qty) }')"
  mismatch="$(awk -v a="${final_stock}" -v b="${expected_final}" 'BEGIN { d = a - b; if (d < 0) d = -d; print (d > 0.0001 ? 1 : 0) }')"
  oversell="$(awk -v ok="${success_count}" -v init="${INITIAL_STOCK}" -v qty="${QTY_PER_ORDER}" 'BEGIN { print ((ok * qty > init + 0.0001) ? 1 : 0) }')"

  if [ "${oversell}" -eq 0 ] && [ "${mismatch}" -eq 0 ] && [ "${other_count}" -eq 0 ]; then
    result="PASS"
  else
    result="FAIL"
  fi

  echo "| ${users} | ${INITIAL_STOCK} | ${QTY_PER_ORDER} | ${success_count} | ${conflict_count} | ${other_count} | ${final_stock} | ${expected_final} | ${oversell} | ${result} | ${other_messages:--} |" >> "${REPORT_FILE}"

  rm -rf "${tmp_dir}"
  cleanup_test_data "${product_id}"

  if [ "${result}" = "FAIL" ]; then
    return 1
  fi
  return 0
}

cat > "${REPORT_FILE}" <<EOF
# Order Concurrency Matrix Report

- Generated at: ${TIMESTAMP}
- API base: ${API_BASE}
- Initial stock per scenario: ${INITIAL_STOCK}
- Qty per order: ${QTY_PER_ORDER}
- Scenario users: ${SCENARIOS}

| users | initial_stock | qty/order | success(200) | conflict(409) | other | final_stock | expected_final | oversell | result | notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
EOF

overall_pass=1
IFS=',' read -r -a scenario_array <<< "${SCENARIOS}"
for scenario in "${scenario_array[@]}"; do
  users="$(echo "${scenario}" | xargs)"
  if ! [[ "${users}" =~ ^[0-9]+$ ]]; then
    echo "Invalid scenario value: '${users}'" >&2
    exit 1
  fi
  if [ "${users}" -lt 1 ]; then
    echo "Scenario users must be >= 1 (got ${users})" >&2
    exit 1
  fi

  if ! run_scenario "${users}"; then
    overall_pass=0
  fi
done

if [ "${overall_pass}" -eq 1 ]; then
  echo "" >> "${REPORT_FILE}"
  echo "**OVERALL RESULT: PASS**" >> "${REPORT_FILE}"
  echo "Report saved to ${REPORT_FILE}"
  exit 0
fi

echo "" >> "${REPORT_FILE}"
echo "**OVERALL RESULT: FAIL**" >> "${REPORT_FILE}"
echo "Report saved to ${REPORT_FILE}"
exit 1
