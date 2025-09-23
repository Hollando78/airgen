interface BreadcrumbItem {
  name: string;
  slug: string | null;
}

interface FileManagerBreadcrumbProps {
  path: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

export function FileManagerBreadcrumb({ path, onNavigate }: FileManagerBreadcrumbProps) {
  return (
    <div className="file-manager-breadcrumb">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="breadcrumb-icon">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
      
      <div className="breadcrumb-path">
        {path.map((item, index) => (
          <div key={index} className="breadcrumb-item">
            {index > 0 && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="breadcrumb-separator">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            )}
            <button
              onClick={() => onNavigate(index)}
              className={`breadcrumb-link ${index === path.length - 1 ? "current" : ""}`}
              title={item.name}
            >
              {item.name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}