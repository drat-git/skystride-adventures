import { describe, expect, it } from 'vitest';
import { validateLayoutV2 } from '../src/course-format';
import { DEFAULT_PROPERTIES, EDITOR_TOOLS, describeCell, newEditorLayout, placeComponent, replaceSelection, resizeCourse, selectionsAt, type V2Tool } from '../src/editor-tools';

describe('V2 editor course data', () => {
  it('creates independently valid drafts without shared mutable components', () => {
    const draft = newEditorLayout(), another = newEditorLayout();
    expect(() => validateLayoutV2(draft)).not.toThrow();
    draft.items.push({ x: 8, y: 20 });
    draft.terrain[0].width = 30;
    expect(another.items).toEqual([]);
    expect(another.terrain[0].width).toBe(64);
  });

  it.each<V2Tool>(['terrain', 'platform', 'solid', 'breakable', 'glow', 'hidden', 'item', 'powerup', 'hazard', 'enemy', 'moving-platform', 'obstacle', 'decoration'])('places and serializes the %s component using the actual format validator', tool => {
    const source = newEditorLayout(), placed = placeComponent(source, 10, 12, tool);
    expect(() => validateLayoutV2(placed)).not.toThrow();
    expect(selectionsAt(JSON.parse(JSON.stringify(placed)), 10, 12).some(p => p.tool === tool)).toBe(true);
    expect(selectionsAt(source, 10, 12)).toHaveLength(0);
    expect(describeCell(placed, 10, 12).description).not.toBe('empty');
  });

  it.each<V2Tool>(['start', 'checkpoint', 'finish'])('places supported %s anchors', tool => {
    const placed = placeComponent(newEditorLayout(), 10, 22, tool);
    expect(() => validateLayoutV2(placed)).not.toThrow();
    expect(selectionsAt(placed, 10, 22).some(p => p.tool === tool)).toBe(true);
  });

  it('preserves all supported block contents, power-ups and decorations through JSON round trips', () => {
    for (const content of ['adaptive', 'coin', 'growth', 'fire', 'star', 'life'] as const) {
      const course = placeComponent(newEditorLayout(), 8, 18, 'glow', { ...DEFAULT_PROPERTIES, content });
      expect(() => validateLayoutV2(course)).not.toThrow();
      expect(selectionsAt(JSON.parse(JSON.stringify(course)), 8, 18)[0].properties.content).toBe(content);
    }
    for (const powerup of ['growth', 'fire', 'star', 'life'] as const) {
      const course = placeComponent(newEditorLayout(), 8, 18, 'powerup', { ...DEFAULT_PROPERTIES, powerup });
      expect(() => validateLayoutV2(course)).not.toThrow();
      expect(course.powerups[0].kind).toBe(powerup);
    }
    for (const decoration of ['sign', 'bush', 'pine', 'sprout', 'cloud', 'crystal', 'ruin', 'door', 'terrain'] as const) {
      const course = placeComponent(newEditorLayout(), 8, 18, 'decoration', { ...DEFAULT_PROPERTIES, decoration });
      expect(() => validateLayoutV2(course)).not.toThrow();
      expect(course.decorations[0]).toEqual({ x: 8, y: 18, kind: decoration });
    }
  });

  it('supports enemy behavior settings and preserves a selected component’s configurable properties', () => {
    for (const behavior of ['hop', 'horizontal', 'vertical'] as const) {
      const props = { ...DEFAULT_PROPERTIES, enemy: 'winged' as const, behavior, direction: 1 as const, speed: 85.5, range: 12 };
      const course = placeComponent(newEditorLayout(), 12, 14, 'enemy', props);
      expect(() => validateLayoutV2(course)).not.toThrow();
      const selected = selectionsAt(course, 12, 14)[0];
      expect(selected.properties).toMatchObject(props);
      const moved = replaceSelection(course, selected, 15, 14, { ...props, speed: 60 });
      expect(moved.enemies).toHaveLength(1); expect(moved.enemies[0]).toMatchObject({ x: 15, y: 14, speed: 60, behavior });
      expect(course.enemies[0].x).toBe(12);
    }
    const ground = placeComponent(newEditorLayout(), 8, 22, 'enemy', { ...DEFAULT_PROPERTIES, enemy: 'turtle', behavior: 'vertical' });
    expect(ground.enemies[0].behavior).toBe('patrol');
  });

  it('edits moving platforms and solid obstacles from any occupied cell', () => {
    const platform = placeComponent(newEditorLayout(), 6, 10, 'moving-platform', { ...DEFAULT_PROPERTIES, width: 4, axis: 'y', distance: 8, durationMs: 6000 });
    const picked = selectionsAt(platform, 8, 10)[0];
    expect(picked).toMatchObject({ x: 6, y: 10, properties: { width: 4, axis: 'y', distance: 8, durationMs: 6000 } });
    const obstacle = placeComponent(platform, 20, 18, 'obstacle', { ...DEFAULT_PROPERTIES, width: 3, height: 4, obstacle: 'ruin' });
    expect(selectionsAt(obstacle, 22, 21)[0]).toMatchObject({ x: 20, y: 18, properties: { width: 3, height: 4, obstacle: 'ruin' } });
    expect(() => validateLayoutV2(obstacle)).not.toThrow();
  });

  it('replaces occupied cells, splits tile runs on erase, and leaves visual decorations independently selectable', () => {
    const source = newEditorLayout(), erased = placeComponent(source, 10, 23, 'erase');
    expect(erased.terrain.filter(p => p.y === 23)).toEqual([{ x: 0, y: 23, width: 10 }, { x: 11, y: 23, width: 53 }]);
    let course = placeComponent(source, 10, 22, 'item');
    course = placeComponent(course, 10, 22, 'hazard', { ...DEFAULT_PROPERTIES, hazard: 'lava' });
    expect(course.items).toHaveLength(0); expect(course.hazards).toHaveLength(1);
    course = placeComponent(course, 10, 22, 'decoration', { ...DEFAULT_PROPERTIES, decoration: 'crystal' });
    expect(selectionsAt(course, 10, 22)).toHaveLength(2);
    expect(placeComponent(course, 10, 22, 'erase').decorations).toHaveLength(0);
    expect(source.terrain[0].width).toBe(64);
    let painted = newEditorLayout();
    for (const x of [10, 8, 9]) painted = placeComponent(painted, x, 12, 'terrain');
    expect(painted.terrain.filter(p => p.y === 12)).toEqual([{ x: 8, y: 12, width: 3 }]);
  });

  it('does not silently crop entities or moving-platform paths when resizing', () => {
    const source = newEditorLayout(); expect(resizeCourse(source, 512).cols).toBe(512);
    expect(() => resizeCourse(source, 32)).toThrow('Remove or resize');
    expect(source.cols).toBe(64);
    const layout = placeComponent(resizeCourse(source, 96), 62, 10, 'moving-platform', { ...DEFAULT_PROPERTIES, distance: 16 });
    expect(() => resizeCourse(layout, 64)).toThrow('travels beyond');
  });

  it('rejects out-of-bounds footprints, invalid settings and component overflow without mutating the draft', () => {
    const source = newEditorLayout(), before = structuredClone(source);
    expect(() => placeComponent(source, -1, 0, 'item')).toThrow();
    expect(() => placeComponent(source, 63, 20, 'platform', { ...DEFAULT_PROPERTIES, width: 2 })).toThrow();
    expect(() => placeComponent(source, 3, 24, 'obstacle', { ...DEFAULT_PROPERTIES, height: 2 })).toThrow();
    expect(() => placeComponent(source, 60, 12, 'moving-platform', { ...DEFAULT_PROPERTIES, distance: 8 })).toThrow('endpoint');
    expect(() => placeComponent(source, 4, 12, 'enemy', { ...DEFAULT_PROPERTIES, speed: 0 })).toThrow();
    expect(source).toEqual(before);
    source.items = Array.from({ length: 1024 }, (_, i) => ({ x: i % 64, y: Math.floor(i / 64) }));
    expect(() => placeComponent(source, 12, 20, 'item')).toThrow('1024');
    expect(source.items).toHaveLength(1024);
    expect(JSON.stringify(EDITOR_TOOLS)).not.toMatch(/pipe|question/i);
  });
});
