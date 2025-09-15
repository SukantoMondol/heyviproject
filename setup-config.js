#!/usr/bin/env node

/**
 * Hejvi Mobile App - Configuration Setup Script
 * 
 * This script helps you quickly configure the app for your environment.
 * Run with: node setup-config.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const configPath = path.join(__dirname, 'src', 'config.js');

console.log('🚀 Hejvi Mobile App - Configuration Setup');
console.log('==========================================\n');

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function setupConfiguration() {
  try {
    console.log('Please provide the following configuration details:\n');

    // Get API Base URL
    const apiBaseUrl = await askQuestion('Enter your API Base URL (e.g., https://api.yourcompany.com/api): ');
    
    // Get Web App Base URL
    const webAppBaseUrl = await askQuestion('Enter your Web App Base URL (e.g., yourcompany.com): ');

    // Validate inputs
    if (!apiBaseUrl || !webAppBaseUrl) {
      console.log('❌ Error: Both API Base URL and Web App Base URL are required.');
      process.exit(1);
    }

    // Read current config file
    let configContent;
    try {
      configContent = fs.readFileSync(configPath, 'utf8');
    } catch (error) {
      console.log('❌ Error: Could not read config file. Make sure you\'re in the project root directory.');
      process.exit(1);
    }

    // Update configuration
    const updatedConfig = configContent
      .replace(/apiBaseUrl:\s*['"][^'"]*['"]/, `apiBaseUrl: '${apiBaseUrl}'`)
      .replace(/webAppBaseUrl:\s*['"][^'"]*['"]/, `webAppBaseUrl: '${webAppBaseUrl}'`);

    // Write updated config
    fs.writeFileSync(configPath, updatedConfig, 'utf8');

    console.log('\n✅ Configuration updated successfully!');
    console.log('\nUpdated settings:');
    console.log(`- API Base URL: ${apiBaseUrl}`);
    console.log(`- Web App Base URL: ${webAppBaseUrl}`);
    
    console.log('\n📋 Next steps:');
    console.log('1. Run "npm install" to install dependencies');
    console.log('2. Run "npm start" to start the development server');
    console.log('3. Test the application in your browser');
    
    console.log('\n📞 Need help?');
    console.log('Contact: protyayrd@gmail.com');
    console.log('Support: 15 days from project delivery');

  } catch (error) {
    console.log('❌ Error during setup:', error.message);
  } finally {
    rl.close();
  }
}

// Run the setup
setupConfiguration();
