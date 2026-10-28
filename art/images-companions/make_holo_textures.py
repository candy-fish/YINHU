"""Original, deterministic surface / moving code textures for both holograms."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import random, math

out = Path(__file__).resolve().parents[2] / 'transition/images/assets'
out.mkdir(parents=True, exist_ok=True)
rng = random.Random(41821)
code = Image.new('RGB', (512,1024), (0,0,0))
draw = ImageDraw.Draw(code)
font_path = Path('C:/Windows/Fonts/consola.ttf')
font = ImageFont.truetype(str(font_path), 15) if font_path.exists() else ImageFont.load_default()
alphabet = '01011010<>/=:{}AX7'
for col in range(32):
    for row in range(60):
        if rng.random() < .39: continue
        brightness = rng.randrange(90,256)
        draw.text((col*16,row*17),rng.choice(alphabet),font=font,fill=(brightness,)*3)
code.save(out/'hologram-code.png',optimize=True)

surface=Image.new('RGB',(512,512),(42,42,42)); draw=ImageDraw.Draw(surface)
for row in range(23):
    for col in range(20):
        x=col*29+(14 if row%2 else 0)-14; y=row*24-12
        value=int(110+65*math.sin((row+col)*.7)**2)
        draw.arc((x,y,x+28,y+28),4,176,fill=(value,)*3,width=2)
        draw.arc((x+4,y+4,x+23,y+25),15,165,fill=(70,)*3,width=1)
surface.save(out/'fish-surface.png',optimize=True)
print('Generated original code and fish-scale textures.')
