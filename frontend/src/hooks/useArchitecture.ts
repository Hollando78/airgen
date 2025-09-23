import { useState, useEffect } from 'react';

export interface ArchComponent {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'external';
  x: number;
  y: number;
  description?: string;
}

export interface ArchConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
  type: 'api' | 'data' | 'event' | 'dependency';
}

export interface Architecture {
  components: ArchComponent[];
  connections: ArchConnection[];
  lastModified: string;
}

export function useArchitecture(tenant: string | null, project: string | null) {
  const [architecture, setArchitecture] = useState<Architecture>({
    components: [],
    connections: [],
    lastModified: new Date().toISOString()
  });

  const storageKey = tenant && project ? `architecture:${tenant}:${project}` : null;

  // Load from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setArchitecture(parsed);
      }
    } catch (error) {
      console.warn('Failed to load architecture from storage:', error);
    }
  }, [storageKey]);

  // Save to localStorage when architecture changes
  const saveArchitecture = (newArchitecture: Architecture) => {
    if (!storageKey) return;
    
    const toSave = {
      ...newArchitecture,
      lastModified: new Date().toISOString()
    };
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(toSave));
      setArchitecture(toSave);
    } catch (error) {
      console.warn('Failed to save architecture to storage:', error);
    }
  };

  const addComponent = (component: Omit<ArchComponent, 'id'>) => {
    const newComponent: ArchComponent = {
      ...component,
      id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    saveArchitecture({
      ...architecture,
      components: [...architecture.components, newComponent]
    });
  };

  const updateComponent = (id: string, updates: Partial<ArchComponent>) => {
    saveArchitecture({
      ...architecture,
      components: architecture.components.map(c => 
        c.id === id ? { ...c, ...updates } : c
      )
    });
  };

  const removeComponent = (id: string) => {
    saveArchitecture({
      ...architecture,
      components: architecture.components.filter(c => c.id !== id),
      connections: architecture.connections.filter(conn => 
        conn.from !== id && conn.to !== id
      )
    });
  };

  const addConnection = (connection: Omit<ArchConnection, 'id'>) => {
    const newConnection: ArchConnection = {
      ...connection,
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    saveArchitecture({
      ...architecture,
      connections: [...architecture.connections, newConnection]
    });
  };

  const removeConnection = (id: string) => {
    saveArchitecture({
      ...architecture,
      connections: architecture.connections.filter(c => c.id !== id)
    });
  };

  const clearArchitecture = () => {
    saveArchitecture({
      components: [],
      connections: [],
      lastModified: new Date().toISOString()
    });
  };

  return {
    architecture,
    addComponent,
    updateComponent,
    removeComponent,
    addConnection,
    removeConnection,
    clearArchitecture,
    hasChanges: architecture.components.length > 0 || architecture.connections.length > 0
  };
}