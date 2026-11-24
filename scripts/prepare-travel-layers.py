"""Build the atlas overlays from the source files listed in map-sources.html."""

import argparse
import json
from pathlib import Path

import contourpy
import numpy as np
from PIL import Image, ImageColor
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from scipy.ndimage import gaussian_filter


WIDTH, HEIGHT = 2160, 1080
# Ordered by the raster class IDs (1–30) in Beck et al.'s Köppen-Geiger legend.
CLIMATE_GROUPS = [
    ('热带', [
        ('热带雨林', '#386d5d', 'Af'),
        ('热带季风', '#5ea593', 'Am'),
        ('热带草原', '#82a66d', 'Aw'),
    ]),
    ('干旱', [
        ('热沙漠', '#b88759', 'BWh'),
        ('冷沙漠', '#916f68', 'BWk'),
        ('热半干旱', '#d0b279', 'BSh'),
        ('冷半干旱', '#9d955f', 'BSk'),
    ]),
    ('温带', [
        ('夏干 · 炎夏', '#c4ca78', 'Csa'),
        ('夏干 · 暖夏', '#9ba44f', 'Csb'),
        ('夏干 · 凉夏', '#71753e', 'Csc'),
        ('冬干 · 炎夏', '#a8bb8d', 'Cwa'),
        ('冬干 · 暖夏', '#768f5d', 'Cwb'),
        ('冬干 · 凉夏', '#536c49', 'Cwc'),
        ('无干季 · 炎夏', '#b2c9ad', 'Cfa'),
        ('无干季 · 暖夏', '#819f90', 'Cfb'),
        ('无干季 · 凉夏', '#4f7874', 'Cfc'),
    ]),
    ('寒带', [
        ('夏干 · 炎夏', '#b69ab5', 'Dsa'),
        ('夏干 · 暖夏', '#977a9d', 'Dsb'),
        ('夏干 · 凉夏', '#775b86', 'Dsc'),
        ('夏干 · 严冬', '#584466', 'Dsd'),
        ('冬干 · 炎夏', '#909ece', 'Dwa'),
        ('冬干 · 暖夏', '#6f7fb2', 'Dwb'),
        ('冬干 · 凉夏', '#585d95', 'Dwc'),
        ('冬干 · 严冬', '#414271', 'Dwd'),
        ('无干季 · 炎夏', '#abd1d5', 'Dfa'),
        ('无干季 · 暖夏', '#7fa8bc', 'Dfb'),
        ('无干季 · 凉夏', '#577e9c', 'Dfc'),
        ('无干季 · 严冬', '#375c7a', 'Dfd'),
    ]),
    ('极地', [
        ('苔原', '#a4abb9', 'ET'),
        ('冰原', '#d0d9de', 'EF'),
    ]),
]
RELIEF_STOPS = [-6500, -3000, 0, 1000, 2500, 5000]
RELIEF_COLORS = ['#101a25', '#20313a', '#36463b', '#68744c', '#937954', '#d1c4a2']


def color_table(colors):
    return np.asarray([ImageColor.getrgb(color) for color in colors], dtype=float)


def raster_grid(source, method, dtype='float32', size=(WIDTH, HEIGHT)):
    width, height = size
    with rasterio.open(source) as dataset:
        target = np.zeros((height, width), dtype=dtype)
        reproject(
            rasterio.band(dataset, 1), target, src_crs=dataset.crs or 'EPSG:4326',
            dst_transform=from_bounds(-180, -90, 180, 90, width, height),
            dst_crs='EPSG:4326', resampling=method,
        )
    return target


def save_climate(source, output):
    classes = raster_grid(source / 'koppen.tif', Resampling.nearest, dtype='uint8', size=(4320, 2160))
    palette = np.zeros((256, 4), dtype='uint8')
    colors = [color for _, swatches in CLIMATE_GROUPS for _, color, _ in swatches]
    palette[1:len(colors) + 1, :3] = color_table(colors)
    palette[1:len(colors) + 1, 3] = 255
    Image.fromarray(palette[classes]).save(output / 'climate.webp', lossless=True)
    (output / 'climate.json').write_text(json.dumps({'groups': CLIMATE_GROUPS}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def save_relief(source, output):
    meters = raster_grid(source / 'relief.grd', Resampling.bilinear)
    colors = color_table(RELIEF_COLORS)
    # Keep the shoreline distinct, and light ridges from the northwest.
    elevation = np.stack([np.interp(meters, RELIEF_STOPS, channel) for channel in colors.T], axis=-1)
    elevation[(meters < 0) & (meters > -650)] *= [0.63, 0.69, 0.85]
    dy, dx = np.gradient(gaussian_filter(meters, .8, mode=('nearest', 'wrap')))
    light = np.clip(1 + (dx + dy) / np.sqrt(900**2 + dx**2 + dy**2) * .53, .62, 1.34)
    image = np.clip(elevation * light[..., None], 0, 255).astype('uint8')
    Image.fromarray(image).save(output / 'relief.webp', quality=88, method=6)


def save_json(output, name, key, paths):
    (output / f'{name}.json').write_text(json.dumps({'key': key, 'paths': paths}, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')


def path_data(points, closed=False):
    pairs = ' '.join(f'{x:.2f},{y:.2f}' for x, y in points)
    return f'M{pairs}' + ('Z' if closed else '')


def isolines(source, output, name, variable, levels, colors):
    days = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    with rasterio.open(f'NETCDF:"{source}":{variable}') as dataset:
        samples = dataset.read()
    average = np.average(samples, axis=0, weights=days)
    values = average - 273.15 if variable == 'air' else average * 86400 * days.sum()
    rows, cols = values.shape
    # NCEP uses a Gaussian latitude grid and a 0–360° longitude axis.
    latitude = np.rad2deg(np.arcsin(np.polynomial.legendre.leggauss(rows)[0]))[::-1]
    longitude = np.linspace(-180, 180, cols + 1)
    values = np.roll(gaussian_filter(values, .65, mode=('nearest', 'wrap')), cols // 2, axis=1)
    values = np.column_stack([values, values[:, 0]])
    generator = contourpy.contour_generator(x=(longitude + 180) * 3, y=(90 - latitude) * 3, z=values)
    paths = []
    for level, color in zip(levels, colors):
        lines = [path_data(line) for line in generator.lines(level) if np.linalg.norm(np.diff(line, axis=0), axis=1).sum() >= 5]
        paths.append(dict(d=''.join(lines), stroke=color, width=1, opacity=.92))
    save_json(output, name, list(zip(map(str, levels), colors)), paths)


def hydrography(source, output):
    def projected(points):
        return [((lon + 180) * 3, (90 - lat) * 3) for lon, lat in points]

    rivers = json.loads((source / 'rivers.geojson').read_text('utf-8'))['features']
    lakes = json.loads((source / 'lakes.geojson').read_text('utf-8'))['features']
    paths = []
    for major in [False, True]:
        lines = [path_data(projected(line)) for f in rivers
                 if f['properties']['featurecla'] != 'Lake Centerline' and (f['properties']['scalerank'] <= 4) == major
                 for line in f['geometry']['coordinates']]
        paths.append(dict(d=''.join(lines), stroke='#83b0bd', width=.8 if major else .48, opacity=.87 if major else .58))
    rings = [path_data(projected(ring), closed=True) for f in lakes for ring in f['geometry']['coordinates']]
    paths.append(dict(d=''.join(rings), stroke='#9bc8cb', fill='#315461', width=.65, opacity=.8))
    save_json(output, 'rivers', [('河流', '#83b0bd'), ('湖泊', '#9bc8cb')], paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    save_climate(args.source, args.output)
    save_relief(args.source, args.output)
    isolines(args.source / 'air.nc', args.output, 'temperature', 'air',
             [-40, -25, -10, 0, 10, 20, 30],
             ['#9ac0e3', '#7aa6d2', '#8cb2b8', '#a9bc96', '#d2c68a', '#e4af76', '#ed977d'])
    isolines(args.source / 'prate.nc', args.output, 'rainfall', 'prate',
             [100, 250, 500, 1000, 1500, 2000, 3000],
             ['#b7aa79', '#c5c38c', '#a9c694', '#7cbba6', '#6bb4c3', '#90b7ec', '#b9abed'])
    hydrography(args.source, args.output)


if __name__ == '__main__':
    main()
