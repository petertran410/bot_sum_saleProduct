const forge = require("node-forge");
const fs = require("fs");

// Create directory for certificates if it doesn't exist
const sslDir = "./ssl";
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir);
}

// Generate a key pair
console.log("Generating RSA key pair...");
const keys = forge.pki.rsa.generateKeyPair(2048);

// Create a certificate
console.log("Creating self-signed certificate...");
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01";
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

// Add attributes
const attrs = [
  { name: "commonName", value: "localhost" },
  { name: "countryName", value: "VN" },
  { shortName: "ST", value: "Distric 8" },
  { name: "localityName", value: "City" },
  { name: "organizationName", value: "Development" },
  { shortName: "OU", value: "Development" },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);

// Set extensions
cert.setExtensions([
  {
    name: "basicConstraints",
    cA: false,
  },
  {
    name: "keyUsage",
    digitalSignature: true,
    keyEncipherment: true,
  },
  {
    name: "subjectAltName",
    altNames: [
      {
        type: 2, // DNS
        value: "localhost",
      },
      {
        type: 7, // IP
        ip: "127.0.0.1",
      },
    ],
  },
]);

// Sign the certificate
cert.sign(keys.privateKey, forge.md.sha256.create());

// Convert to PEM format
const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
const certPem = forge.pki.certificateToPem(cert);

// Write to files
fs.writeFileSync("./ssl/key.pem", privateKeyPem);
fs.writeFileSync("./ssl/cert.pem", certPem);

console.log(
  "Certificate and key files generated successfully in ./ssl directory!"
);
console.log("You can now use these files to create an HTTPS server.");
