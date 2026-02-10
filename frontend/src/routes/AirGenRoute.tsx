import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { AcceptCandidateModal } from "../components/AirGen/AcceptCandidateModal";
import { AcceptDiagramModal } from "../components/AirGen/AcceptDiagramModal";
import { QueryForm } from "../components/AirGen/QueryForm";
import { CandidateFilters } from "../components/AirGen/CandidateFilters";
import { RequirementCandidateList } from "../components/AirGen/RequirementCandidateList";
import { DiagramCandidateList } from "../components/AirGen/DiagramCandidatePreview";
import { PageLayout } from "../components/layout/PageLayout";
import { useAirGenData } from "../hooks/useAirGenData";
import "./AirGenRoute.css";

export function AirGenRoute(): JSX.Element {
  const d = useAirGenData();

  return (
    <PageLayout
      title="AIRGen"
      description={
        d.tenant && d.project
          ? `${d.tenant} / ${d.project}`
          : "Select a tenant and project to begin drafting requirements"
      }
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'AIRGen' }
      ]}
      maxWidth="full"
    >
      {/* Loading Overlay */}
      {d.chatMutation.isPending && (
        <div className="llm-loading-overlay">
          <div className="llm-loading-content">
            <video
              src="/logo.mov"
              autoPlay
              loop
              muted
              playsInline
              className="llm-loading-video"
            />
            <p className="llm-loading-text">Generating responses...</p>
          </div>
        </div>
      )}

      <div className="airgen-container-inner">
        <div className="airgen-layout">
          <section className="airgen-chat">
            <QueryForm
              mode={d.mode}
              instruction={d.instruction}
              glossary={d.glossary}
              constraints={d.constraints}
              count={d.count}
              attachedDocuments={d.attachedDocuments}
              attachedDiagrams={d.attachedDiagrams}
              tenant={d.tenant}
              project={d.project}
              disabled={d.disabled}
              isPending={d.chatMutation.isPending}
              onModeChange={d.setMode}
              onInstructionChange={d.setInstruction}
              onGlossaryChange={d.setGlossary}
              onConstraintsChange={d.setConstraints}
              onCountChange={d.setCount}
              onAttachedDocumentsChange={d.setAttachedDocuments}
              onAttachedDiagramsChange={d.setAttachedDiagrams}
              onSubmit={d.handleGenerate}
            />
          </section>

          <section className="airgen-results">
            <div className="results-card">
              <header className="results-header">
                <h2 className="results-title">{d.mode === 'requirements' ? 'Candidate requirements' : 'Candidate diagrams'}</h2>
                <CandidateFilters
                  textFilter={d.textFilter}
                  sortOrder={d.sortOrder}
                  onTextFilterChange={d.setTextFilter}
                  onSortOrderChange={d.setSortOrder}
                />
              </header>

              {(d.mode === 'requirements' ? d.candidatesQuery.isLoading : d.diagramCandidatesQuery.isLoading) && (
                <div className="results-loading">
                  <Spinner />
                  <p className="hint">Loading candidates…</p>
                </div>
              )}

              {(d.mode === 'requirements' ? d.candidatesQuery.isError : d.diagramCandidatesQuery.isError) && (
                <ErrorState message={((d.mode === 'requirements' ? d.candidatesQuery.error : d.diagramCandidatesQuery.error) as Error)?.message ?? "Unknown error"} />
              )}

              {d.mode === 'requirements' && (
                <RequirementCandidateList
                  candidateGroups={d.candidateGroups}
                  collapsedGroups={d.collapsedGroups}
                  textFilter={d.textFilter}
                  disabled={d.disabled}
                  onToggleGroupCollapse={d.toggleGroupCollapse}
                  onAcceptClick={d.handleAcceptClick}
                  onRejectClick={(candidate) => d.rejectMutation.mutate(candidate)}
                  onReturnClick={(candidate) => d.returnMutation.mutate(candidate)}
                  onArchiveGroup={(requirementIds) => d.archiveGroupMutation.mutate(requirementIds)}
                  isRejectPending={d.rejectMutation.isPending}
                  isReturnPending={d.returnMutation.isPending}
                />
              )}

              {d.mode === 'diagram' && (
                <DiagramCandidateList
                  candidates={d.diagramCandidatesQuery.data?.items ?? []}
                  disabled={d.disabled}
                  onAcceptClick={d.handleAcceptDiagramClick}
                  onRejectClick={d.handleRejectDiagramClick}
                  onReturnClick={d.handleReturnDiagramClick}
                  isAcceptPending={d.acceptDiagramMutation.isPending}
                  isRejectPending={d.rejectDiagramMutation.isPending}
                  isReturnPending={d.returnDiagramMutation.isPending}
                  acceptingCandidateId={d.acceptingDiagramId}
                  rejectingCandidateId={d.rejectingDiagramId}
                  returningCandidateId={d.returningDiagramId}
                />
              )}
            </div>
          </section>
        </div>
      </div>

      <AcceptCandidateModal
        isOpen={d.showAcceptModal}
        candidate={d.selectedCandidate}
        tenant={d.tenant}
        project={d.project}
        onClose={d.closeAcceptModal}
        onAccepted={d.onAccepted}
      />

      <AcceptDiagramModal
        isOpen={d.showAcceptDiagramModal}
        candidate={d.selectedDiagramCandidate}
        tenant={d.tenant}
        project={d.project}
        onClose={d.closeAcceptDiagramModal}
        onAccept={d.handleAcceptDiagramConfirm}
      />
    </PageLayout>
  );
}
