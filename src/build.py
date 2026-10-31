# Собирает index.html в корне репозитория из src/top.html и js-файлов из src/
import pathlib
src = pathlib.Path(__file__).parent
root = src.parent
top = (src / 'top.html').read_text()
# порядок важен: общее, профили и достижения, затем игры, затем переключатель
parts = ['common.js', 'profile.js', 'achievements.js', 'daily.js', 'engine.js', 'app.js', 'sudoku-engine.js', 'sudoku-app.js', 'killer-engine.js', 'killer-app.js', 'shell.js']
code = '\n'.join((src / p).read_text() for p in parts)
code = code.replace("if (typeof module !== 'undefined') module.exports = Suguru;\n", "")
code = code.replace("if (typeof module !== 'undefined') module.exports = Sudoku12;\n", "")
code = code.replace("if (typeof module !== 'undefined') module.exports = Killer;\n", "")
i = top.index('<div class="app">')
head = top[:i].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
head = head.replace('<meta name="apple-mobile-web-app-capable" content="yes">', '''<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#f1eff8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14122a" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">''')
head = head.replace('html, body { height: 100%; }', '''html, body { height: 100%; }
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); box-sizing: border-box; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }''').replace('body {\n  background', 'body {\n  margin: 0;\n  background', 1)
sw = "\nif ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});\n"
doc = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head.strip()}
</head>
<body>
{top[i:].strip()}
<script>
{code}{sw}</script>
</body>
</html>
'''
(root / 'index.html').write_text(doc)
