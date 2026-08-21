import Package from 'isc-auth/package.json'

export default (req, res) => {
  res.send(Package.version)
}
