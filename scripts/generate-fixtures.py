from PIL import Image, ImageDraw, ImageFont
import zipfile, os, math

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
font_path = r'C:\Windows\Fonts\simhei.ttf'
os.makedirs(os.path.join(root, 'server', 'tests', 'fixtures'), exist_ok=True)
os.makedirs(os.path.join(root, 'e2e', 'fixtures'), exist_ok=True)


def make_cover(path):
    img = Image.new('RGB', (900, 1200), '#FAF8F5')
    d = ImageDraw.Draw(img)
    d.rectangle([24, 24, 876, 1176], outline='#C8102E', width=8)
    d.rectangle([24, 24, 876, 96], fill='#C8102E')
    d.text((340, 40), '赤光文献馆', fill='#FFFFFF', font=ImageFont.truetype(font_path, 40))

    def star(cx, cy, r):
        pts = []
        for i in range(10):
            ang = -math.pi / 2 + i * math.pi / 5
            rr = r if i % 2 == 0 else r * 0.4
            pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
        d.polygon(pts, fill='#C8102E')

    star(450, 420, 140)
    d.text((300, 640), '共产党宣言', fill='#8B0000', font=ImageFont.truetype(font_path, 64))
    d.text((330, 730), '马克思  恩格斯', fill='#595959', font=ImageFont.truetype(font_path, 32))
    d.text((250, 1030), '为了新世界 · 学习理论 · 团结同志', fill='#B3A489', font=ImageFont.truetype(font_path, 22))
    img.save(path, 'JPEG', quality=90)


make_cover(os.path.join(root, 'server', 'tests', 'fixtures', 'cover.jpg'))
make_cover(os.path.join(root, 'e2e', 'fixtures', 'cover.jpg'))

img = Image.new('RGB', (1240, 1754), 'white')
d = ImageDraw.Draw(img)
d.rectangle([50, 50, 1190, 1704], outline='#C8102E', width=6)
d.text((150, 220), '共产党宣言', fill='#8B0000', font=ImageFont.truetype(font_path, 96))
d.text((160, 360), '马克思  恩格斯', fill='#595959', font=ImageFont.truetype(font_path, 40))
d.text((160, 520), '一个幽灵，共产主义的幽灵，在欧洲游荡。', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d.text((160, 590), '为了对这个幽灵进行神圣的围剿，旧欧洲的一切势力，', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d.text((160, 660), '教皇和沙皇、梅特涅和基佐、法国的激进派和德国的警察，', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d.text((160, 730), '都联合起来了。', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d.text((900, 1620), '赤光社 · 测试样张', fill='#B3A489', font=ImageFont.truetype(font_path, 22))

page2 = Image.new('RGB', (1240, 1754), 'white')
d2 = ImageDraw.Draw(page2)
d2.rectangle([50, 50, 1190, 1704], outline='#C8102E', width=6)
d2.text((150, 220), '第二页 · 无产者和共产党人', fill='#8B0000', font=ImageFont.truetype(font_path, 72))
d2.text((160, 380), '共产党人同全体无产者的关系是怎样的呢？', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d2.text((160, 460), '他们没有任何同整个无产阶级的利益不同的利益。', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d2.text((160, 540), '代替那存在着阶级和阶级对立的资产阶级旧社会的，', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d2.text((160, 620), '将是这样一个联合体：每个人的自由发展', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d2.text((160, 700), '是一切人的自由发展的条件。', fill='#2C2C2C', font=ImageFont.truetype(font_path, 34))
d2.text((900, 1620), '赤光社 · 测试样张（第 2 页）', fill='#B3A489', font=ImageFont.truetype(font_path, 22))

img.save(
    os.path.join(root, 'server', 'tests', 'fixtures', 'sample.pdf'),
    'PDF',
    resolution=120,
    save_all=True,
    append_images=[page2],
)
img.save(
    os.path.join(root, 'e2e', 'fixtures', '共产党宣言.pdf'),
    'PDF',
    resolution=120,
    save_all=True,
    append_images=[page2],
)

opf = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:6f2a6a4e-1f0e-4d6a-9a6e-redlight0001</dc:identifier>
    <dc:title>共产党宣言</dc:title>
    <dc:creator>马克思 恩格斯</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2026-11-06T00:00:00Z</meta>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>
'''
nav = '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head><title>目录</title></head>
<body><nav epub:type="toc"><h1>目录</h1><ol><li><a href="chapter1.xhtml">第一章</a></li><li><a href="chapter2.xhtml">第二章</a></li></ol></nav></body></html>
'''
chapter1 = '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head><title>第一章</title><style>body{font-family:serif;padding:40px;line-height:1.9;color:#2C2C2C}h1{color:#8B0000}</style></head>
<body><h1>第一章 资产者和无产者</h1>
<p>至今一切社会的历史都是阶级斗争的历史。</p>
<p>自由民和奴隶、贵族和平民、领主和农奴、行会师傅和帮工，一句话，压迫者和被压迫者，始终处于相互对立的地位。</p>
<p>从封建社会的灭亡中产生出来的现代资产阶级社会并没有消灭阶级对立。它只是用新的阶级、新的压迫条件、新的斗争形式代替了旧的。</p>
</body></html>
'''
chapter2 = '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head><title>第二章</title><style>body{font-family:serif;padding:40px;line-height:1.9;color:#2C2C2C}h1{color:#8B0000}</style></head>
<body><h1>第二章 无产者和共产党人</h1>
<p>共产党人同全体无产者的关系是怎样的呢？</p>
<p>共产党人不是同其他工人政党相对立的特殊政党。他们没有任何同整个无产阶级的利益不同的利益。</p>
<p>代替那存在着阶级和阶级对立的资产阶级旧社会的，将是这样一个联合体，在那里，每个人的自由发展是一切人的自由发展的条件。</p>
</body></html>
'''
container = '''<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
'''
cover_bytes = open(os.path.join(root, 'e2e', 'fixtures', 'cover.jpg'), 'rb').read()
for target in [
    os.path.join(root, 'server', 'tests', 'fixtures', 'sample.epub'),
    os.path.join(root, 'e2e', 'fixtures', '共产党宣言.epub'),
]:
    with zipfile.ZipFile(target, 'w') as z:
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', container, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/content.opf', opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/nav.xhtml', nav, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/chapter1.xhtml', chapter1, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/chapter2.xhtml', chapter2, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/cover.jpg', cover_bytes, compress_type=zipfile.ZIP_DEFLATED)
    print('wrote', target)
print('done')
