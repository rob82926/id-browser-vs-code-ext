import * as vscode from 'vscode';

interface IdPattern {
  name?: string;
  regex: string;
  urlTemplate: string;
}

function getPatterns(): IdPattern[] {
  return vscode.workspace.getConfiguration('idBrowser').get<IdPattern[]>('patterns', []);
}

function buildRegExp(pattern: IdPattern): RegExp | undefined {
  try {
    return new RegExp(pattern.regex, 'g');
  } catch (e) {
    console.error(`ID Browser: invalid regex "${pattern.regex}"`, e);
    return undefined;
  }
}

function resolveUrl(pattern: IdPattern, matchedId: string): string {
  return pattern.urlTemplate.replace(/\$\{id\}/g, encodeURIComponent(matchedId));
}

class IdLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const patterns = getPatterns();
    const text = document.getText();

    for (const pattern of patterns) {
      const regex = buildRegExp(pattern);
      if (!regex) continue;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const matchedId = match.groups?.id ?? match[0];
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        const url = resolveUrl(pattern, matchedId);
        const commandUri = vscode.Uri.parse(
          `command:idBrowser.openId?${encodeURIComponent(JSON.stringify({ url, id: matchedId }))}`
        );

        const link = new vscode.DocumentLink(range, commandUri);
        link.tooltip = `Open "${matchedId}" (Ctrl/Cmd+Click) — ${pattern.name ?? pattern.regex}`;
        links.push(link);

        // avoid infinite loop on zero-length matches
        if (match[0].length === 0) regex.lastIndex++;
      }
    }
    return links;
  }
}

let panel: vscode.WebviewPanel | undefined;

function splitAnchor(url: string): { base: string; anchor?: string } {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return { base: url };
  return { base: url.substring(0, hashIndex), anchor: url.substring(hashIndex + 1) };
}

async function openInWebview(url: string, id: string, context: vscode.ExtensionContext) {
  const { base, anchor } = splitAnchor(url);
  const uri = vscode.Uri.parse(url);
  const isFile = uri.scheme === 'file';

  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'idBrowser',
      `ID Browser: ${id}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
  }

  panel.title = `ID Browser: ${id}`;

  if (isFile) {
    const fileUri = vscode.Uri.file(vscode.Uri.parse(base).fsPath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    let html = Buffer.from(bytes).toString('utf8');

    const baseDir = vscode.Uri.joinPath(fileUri, '..');
    const webviewBase = panel.webview.asWebviewUri(baseDir);

    const scrollScript = `
      <script>
        window.addEventListener('DOMContentLoaded', () => {
          const anchor = ${JSON.stringify(anchor ?? '')};
          if (!anchor) return;
          const el = document.getElementById(anchor) || document.querySelector('a[name="' + anchor + '"]');
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      </script>
    `;

    html = html.replace('<head>', `<head><base href="${webviewBase}/">`);
    html = html.includes('</body>')
      ? html.replace('</body>', `${scrollScript}</body>`)
      : html + scrollScript;

    panel.webview.html = html;
  } else {
    // Remote http(s) page via iframe — browser handles #anchor natively on src change
    panel.webview.html = wrapIframe(url);
  }

  panel.reveal(vscode.ViewColumn.Beside);
}

function wrapIframe(url: string): string {
  // Note: many sites send X-Frame-Options/CSP headers that block iframe embedding.
  // In that case, fall back to "Open in external browser" from the panel.
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      html, body { margin: 0; padding: 0; height: 100%; }
      iframe { border: 0; width: 100%; height: 100vh; }
      .bar { padding: 6px 10px; font-family: sans-serif; font-size: 12px; background: #2d2d2d; color: #ccc; }
      a { color: #4daafc; }
    </style>
  </head>
  <body>
    <div class="bar">${url}</div>
    <iframe src="${url}"></iframe>
  </body>
  </html>`;
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider({ scheme: 'file' }, new IdLinkProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('idBrowser.openId', (args: { url: string; id: string }) => {
      console.log('idBrowser.openId fired with', args);
      const openIn = vscode.workspace.getConfiguration('idBrowser').get<string>('openIn', 'webview');
      if (openIn === 'externalBrowser') {
        vscode.env.openExternal(vscode.Uri.parse(args.url, true));
      } else {
        openInWebview(args.url, args.id, context);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('idBrowser.configure', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'idBrowser.patterns');
    })
  );
}

export function deactivate() {}