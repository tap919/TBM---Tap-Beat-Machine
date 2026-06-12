#!/usr/bin/env node

/**
 * Setup script for Demucs stem separation
 * Checks Python installation and demucs package
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🔧 TBM Stem Separation Setup\n');

// Check Python installation
console.log('1. Checking Python installation...');
const pythonCheck = spawnSync('python3', ['--version'], { encoding: 'utf8' });
const python3Available = pythonCheck.status === 0;

const pythonCheck2 = spawnSync('python', ['--version'], { encoding: 'utf8' });
const pythonAvailable = pythonCheck2.status === 0;

if (!python3Available && !pythonAvailable) {
  console.error('❌ Python not found. Please install Python 3.8+ from:');
  console.error('   https://www.python.org/downloads/');
  console.error('\nAfter installation, restart your terminal and run this script again.');
  process.exit(1);
}

const pythonCmd = python3Available ? 'python3' : 'python';
console.log(`✅ Python found: ${pythonCmd}`);

// Check pip installation
console.log('\n2. Checking pip installation...');
try {
  const pipCheck = spawnSync(pythonCmd, ['-m', 'pip', '--version'], { encoding: 'utf8' });
  if (pipCheck.status !== 0) {
    console.error('❌ pip not found. Please install pip for Python.');
    console.error(`   Run: ${pythonCmd} -m ensurepip --upgrade`);
    process.exit(1);
  }
  console.log('✅ pip is installed');
} catch (error) {
  console.error('❌ Error checking pip:', error.message);
  process.exit(1);
}

// Check/install demucs
console.log('\n3. Checking demucs installation...');
try {
  const demucsCheck = spawnSync(pythonCmd, ['-m', 'demucs', '--help'], { 
    encoding: 'utf8',
    stdio: 'ignore'
  });
  
  if (demucsCheck.status === 0) {
    console.log('✅ demucs is already installed');
  } else {
    console.log('⚠️  demucs not found. Installing...');
    console.log('   This may take a few minutes and download ~4GB of model weights.');
    
    const install = spawnSync(pythonCmd, ['-m', 'pip', 'install', 'demucs'], {
      encoding: 'utf8',
      stdio: 'inherit'
    });
    
    if (install.status !== 0) {
      console.error('❌ Failed to install demucs');
      console.error('   Try installing manually:');
      console.error(`   ${pythonCmd} -m pip install demucs`);
      process.exit(1);
    }
    
    console.log('✅ demucs installed successfully');
  }
} catch (error) {
  console.error('❌ Error checking demucs:', error.message);
  process.exit(1);
}

// Verify installation
console.log('\n4. Verifying installation...');
try {
  const verify = spawnSync(pythonCmd, ['-m', 'demucs', '--help'], {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  if (verify.status === 0) {
    console.log('✅ demucs is working correctly');
    
    // Check for torch cache directory
    const torchCacheDir = join(os.homedir(), '.cache', 'torch', 'hub', 'checkpoints');
    console.log(`\n📁 Model cache directory: ${torchCacheDir}`);
    
    if (fs.existsSync(torchCacheDir)) {
      const files = fs.readdirSync(torchCacheDir);
      const modelFiles = files.filter(f => /\.th$/.test(f));
      console.log(`   Found ${modelFiles.length} model file(s)`);
    } else {
      console.log('   No model cache yet (will download on first use)');
    }
  } else {
    console.error('❌ demucs verification failed');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Verification error:', error.message);
  process.exit(1);
}

console.log('\n🎉 Setup complete!');
console.log('\nNext steps:');
console.log('1. Start TBM development server:');
console.log('   npm run dev');
console.log('\n2. Check stem separator health at:');
console.log('   http://localhost:3000/api/stems/health');
console.log('\n3. Use the Stem Separator tab in TBM to separate audio files');