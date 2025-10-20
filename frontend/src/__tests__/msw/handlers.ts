import { http, HttpResponse } from "msw";
import type { JsonBodyType } from "msw";

export const baseHandlers = [
  http.get("/health", () => HttpResponse.json({ status: "ok" }))
];

export function mockAirGenCandidates(response: JsonBodyType) {
  return http.get("/api/airgen/candidates/:tenant/:project/grouped", () => HttpResponse.json(response));
}

export function createCandidatesSequence(responses: JsonBodyType[]) {
  let calls = 0;
  return {
    handler: http.get("/api/airgen/candidates/:tenant/:project/grouped", () => {
      const response = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return HttpResponse.json(response);
    }),
    getCallCount: () => calls
  };
}

export function mockAirGenCandidatesError(message: string, status = 500) {
  return http.get("/api/airgen/candidates/:tenant/:project/grouped", () =>
    HttpResponse.json({ message }, { status })
  );
}

export function mockDiagramCandidates(response: JsonBodyType) {
  return http.get("/api/airgen/diagram-candidates/:tenant/:project", () => HttpResponse.json(response));
}

export function createDiagramSequence(responses: JsonBodyType[]) {
  let calls = 0;
  return {
    handler: http.get("/api/airgen/diagram-candidates/:tenant/:project", () => {
      const response = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return HttpResponse.json(response);
    }),
    getCallCount: () => calls
  };
}

export function mockCandidateAction(action: "accept" | "reject" | "return") {
  return http.post(`/api/airgen/candidates/:id/${action}`, async ({ request }) => {
    await request.json().catch(() => ({}));
    return HttpResponse.json({ ok: true });
  });
}

export function mockDocumentsList(documents: JsonBodyType) {
  return http.get("/api/documents/:tenant/:project", () =>
    HttpResponse.json({ documents })
  );
}

export function mockDocumentSections(sections: JsonBodyType) {
  return http.get("/api/sections/:tenant/:project/:documentSlug", () =>
    HttpResponse.json({ sections })
  );
}

export function mockDiagramCandidateAction(action: "accept" | "reject" | "return") {
  return http.post(`/api/airgen/diagram-candidates/:id/${action}`, async ({ params, request }) => {
    await request.json().catch(() => ({}));
    if (action === "accept") {
      return HttpResponse.json({
        candidate: { id: params.id, status: "accepted" },
        diagramId: "diagram-accepted"
      });
    }
    return HttpResponse.json({
      candidate: { id: params.id, status: action === "reject" ? "rejected" : "pending" }
    });
  });
}
