# id-browser-vs-code-ext
VS Code Extension to lookup IDs in browser in the IDE

This plugin is to view web content based on identifiers such as MY_REQ_0006 in code files. The plugin could be setup to load https://www.duckduckgo.com/?q=MY_REQ_0006 when this is clicked for example. Use the plugin settings (Settings => Extensions => ID Browser) to set the URL and search patterns for the identifiers. Ctrl/cmd + Click the identifiers to see the relevant web content in the plugin window.

# Build
Check node.js is installed: `node --version`
`npm install`
`npm run compile`
F5 and debug in the extension development host

