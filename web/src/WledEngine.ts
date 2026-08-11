export interface EffectInfo {
  id: number;
  name: string;
}

export interface PaletteInfo {
  id: number;
  name: string;
}

interface EmscriptenWledModule {
  HEAPU32: Uint32Array;
  _wled_init(count: number): number;
  _wled_resize(count: number): number;
  _wled_reset(seed: number): void;
  _wled_set_effect(id: number): void;
  _wled_set_speed(value: number): void;
  _wled_set_intensity(value: number): void;
  _wled_set_palette(id: number): void;
  _wled_set_primary_color(r: number, g: number, b: number): void;
  _wled_set_secondary_color(r: number, g: number, b: number): void;
  _wled_tick(timeMs: number): void;
  _wled_get_pixel_buffer(): number;
  _wled_get_led_count(): number;
  _wled_get_effect_count(): number;
  _wled_get_effect_name(id: number): number;
  _wled_get_palette_count(): number;
  _wled_get_palette_name(id: number): number;
  _wled_get_oob_write_count(): number;
  UTF8ToString(pointer: number): string;
}

type WledModuleFactory = (options?: {
  locateFile?: (path: string) => string;
}) => Promise<EmscriptenWledModule>;

export class WledEngine {
  private constructor(private readonly module: EmscriptenWledModule) {}

  static async create(ledCount: number): Promise<WledEngine> {
    const moduleUrl = new URL("./wasm/wled-engine.js", document.baseURI).href;
    const imported = (await import(/* @vite-ignore */ moduleUrl)) as {
      default: WledModuleFactory;
    };
    const module = await imported.default({
      locateFile: (path) => new URL("./wasm/" + path, document.baseURI).href,
    });
    const engine = new WledEngine(module);
    if (!module._wled_init(ledCount)) {
      throw new Error(`WLED engine rejected LED count ${ledCount}`);
    }
    return engine;
  }

  resize(ledCount: number): void {
    if (!this.module._wled_resize(ledCount)) {
      throw new Error(`WLED engine rejected LED count ${ledCount}`);
    }
  }

  reset(seed = 0x1a2b3c4d): void {
    this.module._wled_reset(seed);
  }

  tick(timeMs: number): void {
    this.module._wled_tick(timeMs >>> 0);
  }

  setEffect(id: number): void {
    this.module._wled_set_effect(id);
  }

  setSpeed(value: number): void {
    this.module._wled_set_speed(value);
  }

  setIntensity(value: number): void {
    this.module._wled_set_intensity(value);
  }

  setPalette(id: number): void {
    this.module._wled_set_palette(id);
  }

  setPrimaryColor(hex: string): void {
    const [r, g, b] = parseHexColor(hex);
    this.module._wled_set_primary_color(r, g, b);
  }

  setSecondaryColor(hex: string): void {
    const [r, g, b] = parseHexColor(hex);
    this.module._wled_set_secondary_color(r, g, b);
  }

  get pixels(): Uint32Array {
    const start = this.module._wled_get_pixel_buffer() >>> 2;
    return this.module.HEAPU32.subarray(start, start + this.ledCount);
  }

  get ledCount(): number {
    return this.module._wled_get_led_count();
  }

  get effects(): EffectInfo[] {
    return Array.from({ length: this.module._wled_get_effect_count() }, (_, id) => ({
      id,
      name: this.module.UTF8ToString(this.module._wled_get_effect_name(id)),
    }));
  }

  get palettes(): PaletteInfo[] {
    return Array.from({ length: this.module._wled_get_palette_count() }, (_, id) => ({
      id,
      name: this.module.UTF8ToString(this.module._wled_get_palette_name(id)),
    }));
  }

  get outOfBoundsWriteCount(): number {
    return this.module._wled_get_oob_write_count();
  }
}

function parseHexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
