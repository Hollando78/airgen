# Browser Dialogs Replacement Progress

## Overview
Replacing native browser dialogs (`window.alert`, `window.confirm`, `window.prompt`) with proper UI components for better UX, accessibility, and consistency.

## Components Created

### ✅ Core Components
- **AlertDialog** (`alert-dialog.tsx`) - Base Radix UI alert dialog component
- **ConfirmDialog** (`confirm-dialog.tsx`) - Reusable confirmation dialog with variant support
- **PromptDialog** (`prompt-dialog.tsx`) - Input dialog for text prompts
- **Toast** (`toast.tsx`, `toaster.tsx`) - Already exists (using Sonner)

## Files Completed

### ✅ ArchitectureRoute/ArchitectureWorkspace.tsx (6 dialogs)
- ✅ Line 267: `window.prompt` → `PromptDialog` (create diagram)
- ✅ Line 273: `window.alert` → `toast.error` (create error)
- ✅ Line 281: `window.prompt` → `PromptDialog` (rename diagram)
- ✅ Line 285: `window.alert` → `toast.error` (rename error)
- ✅ Line 292: `window.confirm` → `ConfirmDialog` (delete diagram)
- ✅ Line 295: `window.alert` → `toast.error` (delete error)
- ✅ Line 301: `window.confirm` → `ConfirmDialog` (clear diagram)

### ✅ hooks/useDiagramCanvasInteractions.ts (2 alerts)
- ✅ Line 454: `window.alert` → `toast.warning` (no diagram selected)
- ✅ Line 487: `window.alert` → `toast.warning` (no diagram selected)

## Remaining Files (Priority Order)

### 🔴 High Priority

#### LinksetManagementPanel.tsx (5 alerts)
- Line 95: `alert` - Same source/target validation
- Line 107: `alert` - Create linkset error
- Line 123: `alert` - Delete linkset error
- Line 139: `alert` - Update linkset error
- Line 313: `alert` - Show linkset details (info display)

**Recommendation**: Replace with `toast.error()` for errors, consider a proper details modal for line 313

#### RequirementContextMenu.tsx (2 confirms)
- Line 497: `confirm` - Delete trace link confirmation
- Line 552: `confirm` - Delete trace link confirmation

**Recommendation**: Use `ConfirmDialog` component

#### ImportModal.tsx (3 alerts)
- Line 190: `alert` - Parse error
- Line 332: `alert` - Missing target section
- Line 377: `alert` - Success message
- Line 382: `alert` - Import failed

**Recommendation**: Use `toast.error()` for errors, `toast.success()` for success

### 🟡 Medium Priority

#### HistoryModal.tsx (2 dialogs)
- Line 90: `confirm` - Restore version confirmation
- Line 97: `alert` - Restore success
- Line 101: `alert` - Restore failure

**Recommendation**: Use `ConfirmDialog` + `toast` notifications

#### EditRequirementModal.tsx (1 confirm)
- Line 68: `window.confirm` - Delete requirement

**Recommendation**: Use `ConfirmDialog` component

#### FloatingDocumentWindow.tsx (2 alerts)
- Line 230: `alert` - Create link error
- Line 246: `alert` - Delete link error

**Recommendation**: Use `toast.error()`

### 🟢 Low Priority

#### ExportModal.tsx (1 alert)
- Line 79: `alert` - Export failed

**Recommendation**: Use `toast.error()`

#### ArchitectureTreeBrowser.tsx (1 prompt)
- Line 173: `prompt` - Create package name

**Recommendation**: Use `PromptDialog` component

#### AdminUsersRoute.tsx (1 confirm)
- Line 162: `window.confirm` - Delete user

**Recommendation**: Use `ConfirmDialog` component

#### DashboardRoute.tsx (1 confirm)
- Line 354: `confirm` - Delete tenant

**Recommendation**: Use `ConfirmDialog` component

#### DocumentManager.tsx (1 alert)
- Line 395: `window.alert` - Download failed

**Recommendation**: Use `toast.error()`

#### GraphViewerRoute.tsx (1 prompt)
- Line 868+: Save current view

**Recommendation**: Use `PromptDialog` component

#### RequirementsSchemaRoute.tsx (1 alert)
- Line 960: `alert` - Create linkset error

**Recommendation**: Use `toast.error()`

### ⚪ Archived Files (Skip)
- `InterfaceRoute/archived/InterfaceWorkspace.tsx.archived` - Archived file, no action needed

## Summary

- **Total instances**: 27
- **Completed**: 8 (30%)
- **Remaining**: 19 (70%)
  - High priority: 10
  - Medium priority: 5
  - Low priority: 4

## Implementation Pattern

### For Confirmation Dialogs
```tsx
const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });

// Handler
const handleDelete = (id: string) => {
  setDeleteDialog({ open: true, id });
};

// Dialog
<ConfirmDialog
  open={deleteDialog.open}
  onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
  onConfirm={handleConfirmDelete}
  title="Confirm Deletion"
  description="Are you sure you want to delete this item?"
  confirmText="Delete"
  variant="destructive"
/>
```

### For Prompts
```tsx
const [promptOpen, setPromptOpen] = useState(false);

<PromptDialog
  open={promptOpen}
  onOpenChange={setPromptOpen}
  onConfirm={handleSubmit}
  title="Enter Name"
  label="Name"
  placeholder="Enter a name..."
/>
```

### For Alerts/Errors
```tsx
import { toast } from 'sonner';

// Error
toast.error('Something went wrong');

// Success
toast.success('Operation completed');

// Warning
toast.warning('Please select a diagram first');
```

## Next Steps

1. Replace all instances in `LinksetManagementPanel.tsx` (5 alerts)
2. Replace confirmations in `RequirementContextMenu.tsx` (2 confirms)
3. Replace alerts in `ImportModal.tsx` (3 alerts)
4. Continue with medium and low priority files
5. Test all replacements for proper functionality
6. Remove any unused browser dialog calls

---

**Last Updated**: 2025-10-10
**Status**: In Progress (30% complete)
