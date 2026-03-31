FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl rclone \
    && ARCH="$(dpkg --print-architecture)" \
    && case "$ARCH" in \
         amd64) TOOLS_ARCH="x86_64" ;; \
         arm64) TOOLS_ARCH="arm64" ;; \
         *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
       esac \
    && TOOLS_VERSION="100.10.0" \
    && curl -fsSL "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-${TOOLS_ARCH}-${TOOLS_VERSION}.tgz" -o /tmp/mongodb-tools.tgz \
    && tar -xzf /tmp/mongodb-tools.tgz -C /tmp \
    && cp /tmp/mongodb-database-tools-*/bin/mongorestore /usr/local/bin/mongorestore \
    && chmod +x /usr/local/bin/mongorestore \
    && rm -rf /var/lib/apt/lists/* /tmp/mongodb-tools.tgz /tmp/mongodb-database-tools-*
COPY --from=build /app/target/backend-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
