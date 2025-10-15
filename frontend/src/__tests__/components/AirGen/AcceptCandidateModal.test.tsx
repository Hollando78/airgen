import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcceptCandidateModal } from "../../../components/AirGen/AcceptCandidateModal";
import { server } from "../../setup";
import { mockDocumentsList, mockDocumentSections } from "../../msw/handlers";

vi.mock("../../../components/CreateDocumentModal", () => ({
  CreateDocumentModal: () => null
}));

vi.mock("../../../components/AddSectionModal", () => ({
  AddSectionModal: () => null
}));

vi.mock("../../../components/EditDocumentModal", () => ({
  EditDocumentModal: () => null
}));

vi.mock("../../../components/EditSectionModal", () => ({
  EditSectionModal: () => null
}));

vi.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "qa@example.com",
      roles: ["user"],
      tenantSlugs: ["hollando"],
      ownedTenantSlugs: ["hollando"]
    },
    token: "test-token",
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    error: null,
    mfaRequired: false,
    mfaTempToken: null,
    verifyMfa: vi.fn(),
    setSession: vi.fn()
  })
}));

function renderModal(overrides: Partial<React.ComponentProps<typeof AcceptCandidateModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  const props: React.ComponentProps<typeof AcceptCandidateModal> = {
    isOpen: true,
    candidate: {
      id: "cand-accept",
      text: "The system shall encrypt telemetry within 50 ms.",
      status: "pending",
      qa: { score: 90, verdict: "GREEN", suggestions: [] },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    } as any,
    tenant: "hollando",
    project: "main-battle-tank",
    onClose: vi.fn(),
    onAccepted: vi.fn()
  };

  return {
    queryClient,
    onClose: props.onClose,
    onAccepted: props.onAccepted,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AcceptCandidateModal {...props} {...overrides} />
      </QueryClientProvider>
    )
  };
}

const documents = [
  {
    slug: "urd",
    name: "User Requirements Document",
    kind: "structured",
    description: "Primary requirements",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  }
];

const sections = [
  {
    id: "sec-1",
    name: "Introduction",
    order: 1,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  }
];

describe("AcceptCandidateModal", () => {
  beforeEach(() => {
    server.use(
      mockDocumentsList(documents),
      mockDocumentSections(sections)
    );
  });

  function getSelectByLabel(labelText: string): HTMLSelectElement {
    const label = screen.getByText(labelText, { selector: "label" });
    const select = label.nextElementSibling;
    if (!select || select.tagName !== "SELECT") {
      throw new Error(`No select element found for label "${labelText}"`);
    }
    return select as HTMLSelectElement;
  }

  it("accepts a requirement and closes the modal", async () => {
    const acceptSpy = vi.fn();

    server.use(
      http.post("/api/airgen/candidates/:id/accept", async ({ params, request }) => {
        acceptSpy(params.id);
        await request.json();
        return HttpResponse.json({
          candidate: { id: params.id, status: "accepted" }
        });
      })
    );

    const { onAccepted, onClose } = renderModal();

    await waitFor(() => {
      expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
    });

    const documentSelect = getSelectByLabel("Document");
    await waitFor(() => {
      expect(Array.from(documentSelect.options).some(option => option.value === "urd")).toBe(true);
    });
    await userEvent.selectOptions(documentSelect, "urd");

    const sectionSelect = getSelectByLabel("Section");
    await waitFor(() => {
      expect(sectionSelect.disabled).toBe(false);
      expect(sectionSelect.querySelectorAll("option")).toHaveLength(2);
    });
    await waitFor(() => {
      expect(sectionSelect.querySelectorAll("option")).toHaveLength(2);
    });
    await userEvent.selectOptions(sectionSelect, "sec-1");

    await userEvent.click(screen.getByRole("button", { name: /accept requirement/i }));

    await waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith("cand-accept");
      expect(onAccepted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("surfaces API errors when acceptance fails", async () => {
    server.use(
      http.post("/api/airgen/candidates/:id/accept", () =>
        HttpResponse.json({ message: "Unable to accept" }, { status: 500 })
      )
    );

    renderModal();

    await waitFor(() => {
      expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
    });

    const documentSelect = getSelectByLabel("Document");
    await waitFor(() => {
      expect(Array.from(documentSelect.options).some(option => option.value === "urd")).toBe(true);
    });
    await userEvent.selectOptions(documentSelect, "urd");

    const sectionSelect = getSelectByLabel("Section");
    await userEvent.selectOptions(sectionSelect, "sec-1");

    await userEvent.click(screen.getByRole("button", { name: /accept requirement/i }));

    await waitFor(() => {
      expect(screen.getByText("Unable to accept")).toBeInTheDocument();
    });
  });
});
