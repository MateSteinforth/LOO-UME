import { compileEquatorMapping } from "../../src/effects/EquatorMapping.ts";
import type { LedMapping } from "./LedMapping.ts";

export const EQUATOR_EFFECT_ID = 1000;

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
  _equator_reset(seed: number): void;
  _equator_set_point(index: number, longitude: number, height: number): number;
  _equator_tick(
    timeMs: number,
    bass: number,
    treble: number,
    speed: number,
    intensity: number,
    color: number,
  ): void;
  UTF8ToString(pointer: number): string;
}

type WledModuleFactory = (options?: {
  locateFile?: (path: string) => string;
}) => Promise<EmscriptenWledModule>;

export class WledEngine {
  private effectId = 8;
  private speed = 128;
  private intensity = 128;
  private primaryColor = 0xff7a18;
  private bass = 0;
  private treble = 0;
  private constructor(
    private readonly module: EmscriptenWledModule,
    private logicalLedCount: number,
  ) {}

  static async create(ledCount: number): Promise<WledEngine> {
    const moduleUrl = new URL("./wasm/wled-engine.js", document.baseURI).href;
    const imported = (await import(/* @vite-ignore */ moduleUrl)) as {
      default: WledModuleFactory;
    };
    const module = await imported.default({
      locateFile: (path) => new URL("./wasm/" + path, document.baseURI).href,
    });
    const engine = new WledEngine(module, ledCount);
    if (!module._wled_init(Math.max(1, ledCount))) {
      throw new Error(`WLED engine rejected LED count ${ledCount}`);
    }
    return engine;
  }

  resize(ledCount: number): void {
    if (!this.module._wled_resize(Math.max(1, ledCount))) {
      throw new Error(`WLED engine rejected LED count ${ledCount}`);
    }
    this.logicalLedCount = ledCount;
  }

  reset(seed = 0x1a2b3c4d): void {
    this.module._wled_reset(seed);
    this.module._equator_reset(seed);
  }

  tick(timeMs: number): void {
    if (this.effectId === EQUATOR_EFFECT_ID) {
      this.module._equator_tick(
        timeMs >>> 0,
        this.bass,
        this.treble,
        this.speed,
        this.intensity,
        this.primaryColor,
      );
    } else {
      this.module._wled_tick(timeMs >>> 0);
    }
  }

  setEffect(id: number): void {
    this.effectId = id;
    if (id === EQUATOR_EFFECT_ID) this.module._equator_reset(0x1a2b3c4d);
    else this.module._wled_set_effect(id);
  }

  setMapping(mapping: LedMapping): void {
    const points = compileEquatorMapping(mapping.entries);
    if (points.length !== this.ledCount)
      throw new Error("Equator Wave mapping does not match the LED count.");
    for (const [index, point] of points.entries()) {
      if (
        !this.module._equator_set_point(index, point.longitude, point.height)
      ) {
        throw new Error("Equator Wave rejected a mapping coordinate.");
      }
    }
    this.module._equator_reset(0x1a2b3c4d);
  }

  setAudio(bass: number, treble: number): void {
    this.bass = byte(bass);
    this.treble = byte(treble);
  }

  setSpeed(value: number): void {
    this.speed = byte(value);
    this.module._wled_set_speed(value);
  }

  setIntensity(value: number): void {
    this.intensity = byte(value);
    this.module._wled_set_intensity(value);
  }

  setPalette(id: number): void {
    this.module._wled_set_palette(id);
  }

  setPrimaryColor(hex: string): void {
    const [r, g, b] = parseHexColor(hex);
    this.primaryColor = (r << 16) | (g << 8) | b;
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
    return this.logicalLedCount;
  }

  get effects(): EffectInfo[] {
    return [
      ...Array.from(
        { length: this.module._wled_get_effect_count() },
        (_, id) => ({
          id,
          name: this.module.UTF8ToString(this.module._wled_get_effect_name(id)),
        }),
      ),
      { id: EQUATOR_EFFECT_ID, name: "Equator Wave" },
    ];
  }

  get palettes(): PaletteInfo[] {
    return Array.from(
      { length: this.module._wled_get_palette_count() },
      (_, id) => ({
        id,
        name: this.module.UTF8ToString(this.module._wled_get_palette_name(id)),
      }),
    );
  }

  get outOfBoundsWriteCount(): number {
    return this.module._wled_get_oob_write_count();
  }
}

function byte(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(255, Math.round(value)))
    : 0;
}

function parseHexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
