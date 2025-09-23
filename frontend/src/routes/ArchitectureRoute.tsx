import { useState } from "react";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { useArchitecture, type ArchComponent } from "../hooks/useArchitecture";

const COMPONENT_TYPES = [
  { value: 'frontend', label: 'Frontend', color: '#3b82f6' },
  { value: 'backend', label: 'Backend', color: '#10b981' },
  { value: 'database', label: 'Database', color: '#f59e0b' },
  { value: 'service', label: 'Service', color: '#8b5cf6' },
  { value: 'external', label: 'External', color: '#6b7280' }
] as const;

export function ArchitectureRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const { 
    architecture, 
    addComponent, 
    updateComponent, 
    clearArchitecture, 
    hasChanges 
  } = useArchitecture(tenant, project);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [newComponent, setNewComponent] = useState({
    name: '',
    type: 'frontend' as const,
    description: ''
  });

  if (!tenant || !project) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h1>Architecture</h1>
          <p>Select a tenant and project to define system architecture.</p>
        </div>
      </div>
    );
  }

  const handleAddComponent = () => {
    if (!newComponent.name.trim()) return;
    
    addComponent({
      name: newComponent.name.trim(),
      type: newComponent.type,
      x: 100,
      y: 100,
      description: newComponent.description.trim() || undefined
    });
    
    setNewComponent({ name: '', type: 'frontend', description: '' });
    setShowAddComponent(false);
  };

  const handleComponentDrag = (componentId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const component = architecture.components.find(c => c.id === componentId);
    if (!component) return;

    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setSelectedComponent(componentId);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const canvas = document.querySelector('.architecture-canvas') as HTMLElement;
      if (!canvas) return;
      
      const canvasRect = canvas.getBoundingClientRect();
      const newX = moveEvent.clientX - canvasRect.left - dragOffset.x;
      const newY = moveEvent.clientY - canvasRect.top - dragOffset.y;
      
      updateComponent(componentId, {
        x: Math.max(0, newX),
        y: Math.max(0, newY)
      });
    };

    const handleMouseUp = () => {
      setSelectedComponent(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getComponentTypeInfo = (type: string) => {
    return COMPONENT_TYPES.find(t => t.value === type) || COMPONENT_TYPES[0];
  };

  return (
    <div className="panel-stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1>System Architecture</h1>
            <p>Define components and connections for {project}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowAddComponent(true)}
              className="primary-button"
            >
              + Add Component
            </button>
            <button
              onClick={clearArchitecture}
              className="ghost-button"
              disabled={!hasChanges}
            >
              Clear All
            </button>
          </div>
        </div>

        {showAddComponent && (
          <div className="panel" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
            <h3>Add Component</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label>Name *</label>
                <input
                  type="text"
                  value={newComponent.name}
                  onChange={e => setNewComponent(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., User Service, React App"
                  autoFocus
                />
              </div>
              <div>
                <label>Type</label>
                <select
                  value={newComponent.type}
                  onChange={e => setNewComponent(prev => ({ ...prev, type: e.target.value as any }))}
                >
                  {COMPONENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label>Description</label>
              <input
                type="text"
                value={newComponent.description}
                onChange={e => setNewComponent(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={handleAddComponent} className="primary-button">
                Add Component
              </button>
              <button onClick={() => setShowAddComponent(false)} className="ghost-button">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div 
          className="architecture-canvas"
          style={{
            position: 'relative',
            minHeight: '500px',
            background: '#fafafa',
            border: '2px dashed #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          {architecture.components.length === 0 ? (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#64748b'
            }}>
              <h3>No components yet</h3>
              <p>Add components to visualize your system architecture</p>
            </div>
          ) : (
            architecture.components.map(component => {
              const typeInfo = getComponentTypeInfo(component.type);
              return (
                <div
                  key={component.id}
                  style={{
                    position: 'absolute',
                    left: component.x,
                    top: component.y,
                    background: typeInfo.color,
                    color: 'white',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    cursor: 'move',
                    minWidth: '120px',
                    textAlign: 'center',
                    boxShadow: selectedComponent === component.id 
                      ? '0 4px 12px rgba(0,0,0,0.3)' 
                      : '0 2px 4px rgba(0,0,0,0.1)',
                    border: selectedComponent === component.id ? '2px solid #fff' : 'none'
                  }}
                  onMouseDown={e => handleComponentDrag(component.id, e)}
                  title={component.description}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    {component.name}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {architecture.components.length > 0 && (
          <div className="panel" style={{ marginTop: '16px' }}>
            <h3>Components ({architecture.components.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
              {architecture.components.map(component => {
                const typeInfo = getComponentTypeInfo(component.type);
                return (
                  <div key={component.id} style={{
                    padding: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#fff'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '12px',
                        height: '12px',
                        background: typeInfo.color,
                        borderRadius: '2px'
                      }} />
                      <strong>{component.name}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      {typeInfo.label}
                      {component.description && ` • ${component.description}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}