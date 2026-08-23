/**
 * A memo table partitioned by the object that OWNS the values.
 *
 * Baked Pixi textures belong to the renderer that generated them: hand one to
 * a sprite in a different `Application` and it is bound to a GPU context that
 * no longer exists, and destroying the first renderer takes the texture out
 * from under the second. A single module-scope Map cannot express that
 * ownership; this can.
 *
 * Partitions are held weakly, so an owner that is destroyed and forgotten
 * without anyone calling `clear` still becomes collectable.
 *
 * Deliberately generic and Pixi-free: it is the tested half of the avatar
 * texture cache, and canvas internals are not unit-tested (roadmap §5).
 */
export class OwnedCache<Owner extends object, Value> {
  private readonly partitions = new WeakMap<Owner, Map<string, Value>>();

  /** The value for `key` under `owner`, creating it on first ask. */
  get(owner: Owner, key: string, create: () => Value): Value {
    let partition = this.partitions.get(owner);
    if (!partition) {
      partition = new Map<string, Value>();
      this.partitions.set(owner, partition);
    }
    const cached = partition.get(key);
    if (cached !== undefined) return cached;

    const value = create();
    partition.set(key, value);
    return value;
  }

  /** Live entries for one owner. Tests and diagnostics only. */
  size(owner: Owner): number {
    return this.partitions.get(owner)?.size ?? 0;
  }

  /**
   * Dispose one owner's entries and drop its partition. Every other owner is
   * untouched — which is the difference between this and the module-scope Map
   * it replaces.
   */
  clear(owner: Owner, dispose: (value: Value) => void): void {
    const partition = this.partitions.get(owner);
    if (!partition) return;
    for (const value of partition.values()) dispose(value);
    partition.clear();
    this.partitions.delete(owner);
  }
}
