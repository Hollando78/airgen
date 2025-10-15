import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AirGenRoute } from "../../routes/AirGenRoute";
import { server } from "../setup";
import {
  mockAirGenCandidates,
  mockAirGenCandidatesError,
  mockDiagramCandidates,
  createCandidatesSequence,
  createDiagramSequence,
  mockCandidateAction,
  mockDiagramCandidateAction
} from "../msw/handlers";

vi.mock("../../components/AirGen/AcceptCandidateModal", () => {
  const React = require("react");
  return {
    AcceptCandidateModal: ({ isOpen, candidate, tenant, project, onAccepted, onClose }: any) => {
      React.useEffect(() => {
        if (isOpen && candidate) {
          void fetch(`/api/airgen/candidates/${candidate.id}/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenant, projectKey: project })
          })
            .then(() => {
              onAccepted?.();
              onClose?.();
            })
            .catch(() => {});
        }
      }, [isOpen, candidate, tenant, project, onAccepted, onClose]);
      return null;
    }
  };
});

vi.mock("../../hooks/useTenantProject.tsx", () => ({
  useTenantProject: () => ({
    state: { tenant: "hollando", project: "main-battle-tank" },
    setTenant: vi.fn(),
    setProject: vi.fn(),
    reset: vi.fn()
  })
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "qa@example.com",
      roles: ["user"],
      tenantSlugs: ["hollando"],
      ownedTenantSlugs: ["hollando"]
    },
    token: null,
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

function renderAirGenRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(
    <MemoryRouter initialEntries={["/airgen"]}>
      <QueryClientProvider client={queryClient}>
        <AirGenRoute />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const groupedResponse = {
  groups: [
    {
      sessionId: "session-1",
      prompt: "Provide telemetry safety requirements",
      count: 2,
      candidates: [
        {
          id: "cand-1",
          text: "The system shall transmit mission telemetry within 100 ms of acquisition.",
          status: "pending",
          qa: {
            score: 92,
            verdict: "GREEN",
            suggestions: []
          },
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:01:00Z"
        },
        {
          id: "cand-2",
          text: "The system shall buffer telemetry packets for at least 30 seconds during link outages.",
          status: "accepted",
          qa: {
            score: 88,
            verdict: "GREEN",
            suggestions: ["Clarify buffer storage location"]
          },
          requirementRef: "REQ-1001",
          createdAt: "2024-01-01T00:02:00Z",
          updatedAt: "2024-01-01T00:05:00Z"
        }
      ]
    },
    {
      sessionId: "session-2",
      prompt: "Navigation resilience requirements",
      count: 1,
      candidates: [
        {
          id: "cand-3",
          text: "The vehicle shall recompute guidance vectors within 5 seconds after sensor failure detection.",
          status: "pending",
          qa: {
            score: 90,
            verdict: "GREEN",
            suggestions: []
          },
          createdAt: "2024-01-02T12:00:00Z",
          updatedAt: "2024-01-02T12:00:00Z"
        }
      ]
    }
  ]
};

const diagramResponse = {
  items: [
    {
      id: "diag-1",
      status: "pending",
      action: "create",
      diagramName: "Telemetry Interface Diagram",
      diagramDescription: "Shows uplink/downlink interfaces.",
      diagramView: "block",
      blocks: [],
      connectors: [],
      reasoning: "Synchronize avionics interfaces for redundancy."
    }
  ]
};

describe("AirGenRoute", () => {
  beforeEach(() => {
    server.use(
      mockAirGenCandidates(groupedResponse),
      mockDiagramCandidates(diagramResponse)
    );
  });

  it("renders grouped requirement candidates from the API", async () => {
    renderAirGenRoute();

    await waitFor(() => {
      expect(
        screen.getByText("The system shall transmit mission telemetry within 100 ms of acquisition.")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Provide telemetry safety requirements/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Navigation resilience requirements/)).toBeInTheDocument();
  });

  it("filters candidate groups using the text filter", async () => {
    renderAirGenRoute();

    await waitFor(() => {
      expect(
        screen.getByText("The system shall transmit mission telemetry within 100 ms of acquisition.")
      ).toBeInTheDocument();
    });

    const filterInput = screen.getByLabelText("Filter candidates");
    await userEvent.clear(filterInput);
    await userEvent.type(filterInput, "navigation");

    await waitFor(() => {
      expect(
        screen.getByText('Showing 1 group matching "navigation"')
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText("The system shall transmit mission telemetry within 100 ms of acquisition.")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("The vehicle shall recompute guidance vectors within 5 seconds after sensor failure detection.")
    ).toBeInTheDocument();
  });

  it("switches to diagram mode and loads diagram candidates", async () => {
    renderAirGenRoute();

    const diagramRadio = await screen.findByRole("radio", { name: /diagram/i });
    await userEvent.click(diagramRadio);

    await waitFor(() => {
      expect(
        screen.getByText("Telemetry Interface Diagram")
      ).toBeInTheDocument();
    });
  });

  it("shows an error state when candidate query fails", async () => {
    server.use(mockAirGenCandidatesError("Upstream failure"));

    renderAirGenRoute();

    await waitFor(() => {
      expect(screen.getByText("Upstream failure")).toBeInTheDocument();
    });
  });

  it("accepts a candidate and refetches the list", async () => {
    const { handler, getCallCount } = createCandidatesSequence([
      groupedResponse,
      {
        groups: [
          {
            ...groupedResponse.groups[0],
            candidates: [
              {
                ...groupedResponse.groups[0].candidates[0],
                status: "accepted",
                requirementRef: "REQ-2001"
              },
              groupedResponse.groups[0].candidates[1]
            ]
          }
        ]
      }
    ]);

    server.use(handler, mockCandidateAction("accept"));

    renderAirGenRoute();

    await waitFor(() => {
      expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByRole("button", { name: /^accept$/i })[0]);

    await waitFor(() => {
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText("REQ-2001")).toBeInTheDocument();
  });

  it("rejects a candidate and shows the rejected status", async () => {
    const { handler, getCallCount } = createCandidatesSequence([
      groupedResponse,
      {
        groups: [
          {
            ...groupedResponse.groups[0],
            candidates: [
              {
                ...groupedResponse.groups[0].candidates[0],
                status: "rejected"
              }
            ]
          }
        ]
      }
    ]);

    server.use(handler, mockCandidateAction("reject"));

    renderAirGenRoute();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /reject/i })[0]).toBeEnabled();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /reject/i })[0]);

    await waitFor(() => {
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("returns a rejected candidate to pending state", async () => {
    const { handler, getCallCount } = createCandidatesSequence([
      {
        groups: [
          {
            sessionId: "session-return",
            prompt: "Review rejected candidate",
            count: 1,
            candidates: [
              {
                ...groupedResponse.groups[0].candidates[0],
                status: "rejected"
              }
            ]
          }
        ]
      },
      {
        groups: [
          {
            sessionId: "session-return",
            prompt: "Review rejected candidate",
            count: 1,
            candidates: [
              {
                ...groupedResponse.groups[0].candidates[0],
                status: "pending"
              }
            ]
          }
        ]
      }
    ]);

    server.use(handler, mockCandidateAction("return"));

    renderAirGenRoute();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /return to candidates/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: /return to candidates/i }));

    await waitFor(() => {
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("accepts a diagram candidate and marks it as accepted", async () => {
    const { handler, getCallCount } = createDiagramSequence([
      diagramResponse,
      {
        items: [
          {
            ...diagramResponse.items[0],
            status: "accepted"
          }
        ]
      }
    ]);

    server.use(handler, mockDiagramCandidateAction("accept"));

    renderAirGenRoute();

    const diagramRadio = await screen.findByRole("radio", { name: /diagram/i });
    await userEvent.click(diagramRadio);

    await waitFor(() => {
      expect(screen.getByText("Telemetry Interface Diagram")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText("Diagram has been accepted and created.")).toBeInTheDocument();
  });

  it("rejects a diagram candidate and updates status", async () => {
    const { handler, getCallCount } = createDiagramSequence([
      diagramResponse,
      {
        items: [
          {
            ...diagramResponse.items[0],
            status: "rejected"
          }
        ]
      }
    ]);

    server.use(handler, mockDiagramCandidateAction("reject"));

    renderAirGenRoute();

    const diagramRadio = await screen.findByRole("radio", { name: /diagram/i });
    await userEvent.click(diagramRadio);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^reject$/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    await waitFor(() => {
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("returns a rejected diagram candidate to pending", async () => {
    const { handler, getCallCount } = createDiagramSequence([
      {
        items: [
          {
            ...diagramResponse.items[0],
            status: "rejected"
          }
        ]
      },
      diagramResponse
    ]);

    server.use(handler, mockDiagramCandidateAction("return"));

    renderAirGenRoute();

    const diagramRadio = await screen.findByRole("radio", { name: /diagram/i });
    await userEvent.click(diagramRadio);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /return to candidates/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: /return to candidates/i }));

    await waitFor(() => {
      expect(getCallCount()).toBeGreaterThanOrEqual(2);
    });

    expect(screen.getByText("Telemetry Interface Diagram")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });
});
