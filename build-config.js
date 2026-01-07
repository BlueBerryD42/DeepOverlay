const fs = require('fs');
const path = require('path');
require('dotenv').config();

const envPath = path.join(__dirname, '.env');
const configPath = path.join(__dirname, 'config.js');

if (!fs.existsSync(envPath)) {
    console.error("Error: .env file not found at", envPath);
    process.exit(1);
}

const backendUrl = process.env.BE_URL;

if (!backendUrl) {
    console.error("Error: BE_URL not found in .env file.");
    process.exit(1);
}

const content = `// Auto-generated from .env
export const BACKEND_URL = "${backendUrl}";
`;

fs.writeFileSync(configPath, content);
console.log(`Successfully generated config.js with BACKEND_URL=${backendUrl}`);
