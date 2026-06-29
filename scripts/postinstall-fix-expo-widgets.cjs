const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-widgets',
  'scripts',
  'autolinking.rb'
);

const brokenCall =
  'Expo::AutolinkingManager.new(self, @current_target_definition, options).resolve';
const fixedCall =
  'Expo::AutolinkingManager.new(self, @current_target_definition, options).send(:resolve)';

if (!fs.existsSync(targetFile)) {
  process.exit(0);
}

const source = fs.readFileSync(targetFile, 'utf8');

if (!source.includes(brokenCall) || source.includes(fixedCall)) {
  process.exit(0);
}

fs.writeFileSync(targetFile, source.replace(brokenCall, fixedCall));
console.log('Patched expo-widgets autolinking for CocoaPods compatibility.');
