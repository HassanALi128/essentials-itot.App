import { JSONObject } from "src/app/model/json";
import { GlobalDIDSessionsService } from "src/app/services/global.didsessions.service";
import { GlobalStorageService } from "src/app/services/global.storage.service";

export type CacheEntry = {
  key: string;
  timeValue: number;
  data: JSONObject;
}

export class TimeBasedPersistentCache {
  // List of items, sorted by time value.
  private items: CacheEntry[];

  constructor(private name: string) {}

  /**
   * Returns a cache with data already loaded from disk if any, or an empty cache otherwise.
   */
  public static async loadOrCreate(name: string): Promise<TimeBasedPersistentCache> {
    let cache = new TimeBasedPersistentCache(name);
    await cache.load();
    return cache;
  }

  /**
   * Adds or updates an item to the cache. Item keys are unique.
   * If set() is called again with an existing key, the existing item is overwritten.
   */
  public set(itemKey: string, data: JSONObject, timeValue = 0) {
    let existingIndex = this.items.findIndex(i => i.key == itemKey);

    let newEntry = {
      key: itemKey,
      timeValue,
      data
    };
    if (existingIndex === -1) {
      // Insert the new item
      this.items.push(newEntry);
    }
    else {
      this.items[existingIndex] = newEntry;
    }

    // Sort the cache by time value. TBD: inefficient: better to directly insert at the right index.
    this.items.sort((a, b) => {
      if (a.timeValue > b.timeValue)
        return 1;
      else if (a.timeValue < b.timeValue)
        return -1;
      else
        return 0;
    });
  }

  /**
   * Retrieves a cache item by key.
   */
  public get(itemKey: string): JSONObject | undefined {
    return this.items.find(i => i.key == itemKey);
  }

  /**
   * Returns the cache values. Values are already sorted by time value.
   */
  public values(): CacheEntry[] {
    return this.items;
  }

  /**
   * Returns the current number of items in the loaded cache.
   */
  public size(): number {
    return this.items.length;
  }

  /**
   * Saves the whole cache to disk.
   */
  public async save(): Promise<void> {
    await GlobalStorageService.instance.setSetting(GlobalDIDSessionsService.signedInDIDString, "cache", this.name, this.items);
  }

  /**
   * Loads the cache from disk.
   */
  public async load(): Promise<void> {
    this.items = await GlobalStorageService.instance.getSetting(GlobalDIDSessionsService.signedInDIDString, "cache", this.name, []);
  }
}