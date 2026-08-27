/**
 * Event Bus — Internal event emitter for memory lifecycle events.
 *
 * Emits events when memories are created, updated, invalidated, or
 * when contradictions are detected. Supports webhook delivery and
 * SSE streaming to connected dashboard clients.
 */

import { EventEmitter } from 'node:events';

export type MemoryEventType =
  | 'memory.created'
  | 'memory.updated'
  | 'memory.invalidated'
  | 'memory.contradiction'
  | 'graph.entity_created'
  | 'graph.edge_invalidated';

export interface MemoryEvent {
  type: MemoryEventType;
  userId: number;
  workspaceId?: string;
  timestamp: string;
  data: Record<string, unknown>;
}

class MemoryEventBus {
  private emitter = new EventEmitter();
  private recentEvents: MemoryEvent[] = [];
  private readonly MAX_RECENT_EVENTS = 100;

  /**
   * Emits an event to local listeners and records it in the recent events buffer.
   * Also triggers webhook delivery (implementation TBD).
   *
   * @param event - The memory event to emit
   */
  public emit(event: MemoryEvent): void {
    // Add to circular buffer
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }

    // Emit specific event type and wildcard
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
    
    // TBD: Queue webhook delivery here
  }

  /**
   * Registers a listener for a specific event type or all events ('*').
   *
   * @param type - The event type or '*'
   * @param handler - The callback function
   */
  public on(type: MemoryEventType | '*', handler: (event: MemoryEvent) => void): void {
    this.emitter.on(type, handler);
  }

  /**
   * Unregisters a listener for a specific event type or all events ('*').
   *
   * @param type - The event type or '*'
   * @param handler - The callback function
   */
  public off(type: MemoryEventType | '*', handler: (event: MemoryEvent) => void): void {
    this.emitter.off(type, handler);
  }

  /**
   * Retrieves the most recent events for a specific user.
   *
   * @param userId - The user ID to filter by
   * @param limit - Optional max number of events to return
   * @returns Array of recent memory events
   */
  public getRecentEvents(userId: number, limit?: number): MemoryEvent[] {
    const userEvents = this.recentEvents.filter(e => e.userId === userId);
    if (limit !== undefined && limit > 0) {
      return userEvents.slice(-limit);
    }
    return userEvents;
  }
}

/** Singleton instance of the memory event bus */
export const memoryEvents = new MemoryEventBus();
