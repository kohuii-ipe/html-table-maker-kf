import re

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Dictionary of replacements
replacements = {
    r"Swapping \$\{this\.selectedCells\.length\} cell\$\{this\.selectedCells\.length > 1 \? 's' : ''\}": r"${this.selectedCells.length}個のセルを入れ替え中",
    r"Swapped \$\{swapPairs\.length\} cell\$\{swapPairs\.length > 1 \? 's' : ''\} successfully!": r"${swapPairs.length}個のセルを正常に入れ替えました！",
}

for old, new in replacements.items():
    content = re.sub(old, new, content)

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Conversion completed!")
