import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TenantProjectProvider, useTenantProject } from "../../hooks/useTenantProject";
import { testTenantProjects } from "../helpers/test-data";

describe("useTenantProject", () => {
  const STORAGE_KEY = "airgen.selection";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should initialize with null values when no data in localStorage", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    expect(result.current.state.tenant).toBeNull();
    expect(result.current.state.project).toBeNull();
  });

  it("should load initial state from localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tenant: testTenantProjects.singleTenant.tenant,
        project: testTenantProjects.singleTenant.project
      })
    );

    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);
    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);
  });

  it("should set tenant and persist to localStorage", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    act(() => {
      result.current.setTenant(testTenantProjects.singleTenant.tenant);
    });

    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.tenant).toBe(testTenantProjects.singleTenant.tenant);
  });

  it("should set project and persist to localStorage", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    // First set tenant
    act(() => {
      result.current.setTenant(testTenantProjects.singleTenant.tenant);
    });

    // Then set project
    act(() => {
      result.current.setProject(testTenantProjects.singleTenant.project);
    });

    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.project).toBe(testTenantProjects.singleTenant.project);
  });

  it("should clear project when tenant is set to null", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    // Set tenant and project
    act(() => {
      result.current.setTenant(testTenantProjects.singleTenant.tenant);
      result.current.setProject(testTenantProjects.singleTenant.project);
    });

    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);
    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);

    // Clear tenant
    act(() => {
      result.current.setTenant(null);
    });

    expect(result.current.state.tenant).toBeNull();
    expect(result.current.state.project).toBeNull();
  });

  it("should keep project when changing tenant", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    // Set initial tenant and project
    act(() => {
      result.current.setTenant(testTenantProjects.singleTenant.tenant);
      result.current.setProject(testTenantProjects.singleTenant.project);
    });

    // Change tenant
    act(() => {
      result.current.setTenant(testTenantProjects.multiTenant.tenant);
    });

    expect(result.current.state.tenant).toBe(testTenantProjects.multiTenant.tenant);
    // Project should remain the same
    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);
  });

  it("should reset both tenant and project", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    // Set tenant and project
    act(() => {
      result.current.setTenant(testTenantProjects.singleTenant.tenant);
      result.current.setProject(testTenantProjects.singleTenant.project);
    });

    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);
    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.state.tenant).toBeNull();
    expect(result.current.state.project).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("should handle multiple project switches within same tenant", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    act(() => {
      result.current.setTenant(testTenantProjects.singleTenant.tenant);
    });

    // Switch between projects
    act(() => {
      result.current.setProject(testTenantProjects.singleTenant.project);
    });

    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);

    act(() => {
      result.current.setProject(testTenantProjects.anotherProject.project);
    });

    expect(result.current.state.project).toBe(testTenantProjects.anotherProject.project);
    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);
  });

  it("should handle corrupted localStorage data gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "invalid json");

    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    // Should fallback to null values
    expect(result.current.state.tenant).toBeNull();
    expect(result.current.state.project).toBeNull();
  });

  it("should handle partial localStorage data", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tenant: testTenantProjects.singleTenant.tenant
        // Missing project
      })
    );

    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);
    expect(result.current.state.project).toBeNull();
  });

  it("should persist state across multiple renders", () => {
    const { result, rerender } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    act(() => {
      result.current.setTenant(testTenantProjects.singleTenant.tenant);
      result.current.setProject(testTenantProjects.singleTenant.project);
    });

    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);
    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);

    // Rerender
    rerender();

    expect(result.current.state.tenant).toBe(testTenantProjects.singleTenant.tenant);
    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);
  });

  it("should throw error when used outside provider", () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      renderHook(() => useTenantProject());
    }).toThrow("useTenantProject must be used within TenantProjectProvider");

    console.error = originalError;
  });

  it("should update localStorage on every state change", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    act(() => {
      result.current.setTenant("tenant-1");
    });

    let stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.tenant).toBe("tenant-1");

    act(() => {
      result.current.setProject("project-1");
    });

    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.tenant).toBe("tenant-1");
    expect(stored.project).toBe("project-1");

    act(() => {
      result.current.setTenant("tenant-2");
    });

    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.tenant).toBe("tenant-2");
    expect(stored.project).toBe("project-1");
  });

  it("should handle setting project before tenant", () => {
    const { result } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    // Try to set project without tenant
    act(() => {
      result.current.setProject(testTenantProjects.singleTenant.project);
    });

    expect(result.current.state.tenant).toBeNull();
    expect(result.current.state.project).toBe(testTenantProjects.singleTenant.project);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.tenant).toBeNull();
    expect(stored.project).toBe(testTenantProjects.singleTenant.project);
  });

  it("should provide stable function references", () => {
    const { result, rerender } = renderHook(() => useTenantProject(), {
      wrapper: TenantProjectProvider
    });

    const { setTenant, setProject, reset } = result.current;

    rerender();

    expect(result.current.setTenant).toBe(setTenant);
    expect(result.current.setProject).toBe(setProject);
    expect(result.current.reset).toBe(reset);
  });
});
