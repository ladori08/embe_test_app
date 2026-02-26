try {
  rs.status();
  print('Replica set already initialized');
} catch (err) {
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongodb:27017' }]
  });
  print('Replica set initiated');
}
