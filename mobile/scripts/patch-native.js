// Разрешает лаунчеру видеть и открывать установленный Minecraft (Android 11+ и iOS).
const fs = require('fs');
const path = require('path');

const manifest = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifest)) {
  let xml = fs.readFileSync(manifest, 'utf8');
  if (!xml.includes('com.mojang.minecraftpe')) {
    xml = xml.replace('</manifest>', `    <queries>
        <package android:name="com.mojang.minecraftpe" />
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="minecraft" /></intent>
    </queries>
</manifest>`);
    fs.writeFileSync(manifest, xml);
    console.log('AndroidManifest: добавлен доступ к Minecraft');
  }
}

const plist = path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist');
if (fs.existsSync(plist)) {
  let xml = fs.readFileSync(plist, 'utf8');
  if (!xml.includes('LSApplicationQueriesSchemes')) {
    xml = xml.replace(/<dict>/, `<dict>
	<key>LSApplicationQueriesSchemes</key>
	<array><string>minecraft</string></array>`);
    fs.writeFileSync(plist, xml);
    console.log('Info.plist: добавлена схема minecraft://');
  }
}
