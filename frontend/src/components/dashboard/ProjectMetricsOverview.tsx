import { StatCard } from "./StatCard";
import { MetricsSection } from "./MetricsSection";
import type { ProjectMetrics } from "../../hooks/useProjectMetrics";

interface BaselineInfo {
  ref: string;
  createdAt: string;
}

interface ProjectMetricsOverviewProps {
  metrics: ProjectMetrics;
  latestBaseline?: BaselineInfo;
  latestBaselineRequirementCount: number;
  hasBaselines: boolean;
}

function formatDate(value: string | null | undefined): string {
  if (!value) { return "—"; }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

/**
 * Comprehensive project metrics overview with all distribution sections
 */
export function ProjectMetricsOverview({
  metrics,
  latestBaseline,
  latestBaselineRequirementCount,
  hasBaselines
}: ProjectMetricsOverviewProps) {
  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* High-Level Overview */}
      <MetricsSection title="Overview">
        <div className="grid grid-cols-4">
          <StatCard label="Total Objects" value={metrics.totalObjects} />
          <StatCard label="Requirements" value={metrics.totalRequirements} color="#10b981" />
          <StatCard label="Documents" value={metrics.totalDocuments} />
          <StatCard label="Sections" value={metrics.totalSections} />
          <StatCard label="Linksets" value={metrics.totalLinksets} />
          <StatCard label="Trace Links" value={metrics.totalTraceLinks} />
        </div>
      </MetricsSection>

      {/* Object Type Distribution */}
      <MetricsSection title="Content Object Distribution">
        <div className="grid grid-cols-4">
          <StatCard
            label="Requirements"
            value={metrics.objectTypeCounts.requirement}
            color="#10b981"
          />
          <StatCard
            label="Info Objects"
            value={metrics.objectTypeCounts.info}
            color="#3b82f6"
          />
          <StatCard
            label="Surrogates"
            value={metrics.objectTypeCounts.surrogate}
            color="#8b5cf6"
          />
          <StatCard
            label="Candidates"
            value={metrics.objectTypeCounts.candidate}
            color="#f59e0b"
          />
        </div>
      </MetricsSection>

      {/* Requirements Status */}
      <MetricsSection title="Requirements Status">
        <div className="grid grid-cols-4">
          <StatCard label="Active" value={metrics.activeCount} color="#059669" />
          <StatCard label="Archived" value={metrics.archivedCount} color="#9ca3af" />
          <StatCard
            label="With Pattern"
            value={metrics.objectTypeCounts.requirement - metrics.patternCounts.unspecified}
          />
          <StatCard
            label="Avg QA Score"
            value={metrics.avgQaScore}
            color={
              metrics.avgQaScore >= 70
                ? '#059669'
                : metrics.avgQaScore >= 50
                ? '#f59e0b'
                : '#ef4444'
            }
          />
        </div>
      </MetricsSection>

      {/* Quality Distribution */}
      <MetricsSection title="Quality Distribution">
        <div className="grid grid-cols-4">
          <StatCard
            label="Excellent (≥80)"
            value={metrics.qaDistribution.excellent}
            color="#059669"
            percentage={
              metrics.totalRequirements > 0
                ? Math.round((metrics.qaDistribution.excellent / metrics.totalRequirements) * 100)
                : 0
            }
          />
          <StatCard
            label="Good (60-79)"
            value={metrics.qaDistribution.good}
            color="#3b82f6"
            percentage={
              metrics.totalRequirements > 0
                ? Math.round((metrics.qaDistribution.good / metrics.totalRequirements) * 100)
                : 0
            }
          />
          <StatCard
            label="Needs Work (<60)"
            value={metrics.qaDistribution.needsWork}
            color="#f59e0b"
            percentage={
              metrics.totalRequirements > 0
                ? Math.round((metrics.qaDistribution.needsWork / metrics.totalRequirements) * 100)
                : 0
            }
          />
          <StatCard
            label="Unscored"
            value={metrics.qaDistribution.unscored}
            color="#9ca3af"
            percentage={
              metrics.totalRequirements > 0
                ? Math.round((metrics.qaDistribution.unscored / metrics.totalRequirements) * 100)
                : 0
            }
          />
        </div>
      </MetricsSection>

      {/* Pattern Distribution */}
      <MetricsSection title="Pattern Distribution">
        <div className="grid grid-cols-3">
          <StatCard label="Ubiquitous" value={metrics.patternCounts.ubiquitous} />
          <StatCard label="Event" value={metrics.patternCounts.event} />
          <StatCard label="State" value={metrics.patternCounts.state} />
          <StatCard label="Unwanted" value={metrics.patternCounts.unwanted} />
          <StatCard label="Optional" value={metrics.patternCounts.optional} />
          <StatCard label="Unspecified" value={metrics.patternCounts.unspecified} color="#9ca3af" />
        </div>
      </MetricsSection>

      {/* Verification Distribution */}
      <MetricsSection title="Verification Methods">
        <div className="grid grid-cols-3">
          <StatCard label="Test" value={metrics.verificationCounts.Test} />
          <StatCard label="Analysis" value={metrics.verificationCounts.Analysis} />
          <StatCard label="Inspection" value={metrics.verificationCounts.Inspection} />
          <StatCard label="Demonstration" value={metrics.verificationCounts.Demonstration} />
          <StatCard label="Unspecified" value={metrics.verificationCounts.unspecified} color="#9ca3af" />
        </div>
      </MetricsSection>

      {/* Compliance Status */}
      <MetricsSection title="Compliance Status">
        <div className="grid grid-cols-3">
          <StatCard label="Compliant" value={metrics.complianceCounts.Compliant} color="#059669" />
          <StatCard
            label="Compliance Risk"
            value={metrics.complianceCounts["Compliance Risk"]}
            color="#f59e0b"
          />
          <StatCard
            label="Non-Compliant"
            value={metrics.complianceCounts["Non-Compliant"]}
            color="#ef4444"
          />
          <StatCard label="N/A" value={metrics.complianceCounts["N/A"]} color="#6b7280" />
          <StatCard label="Unspecified" value={metrics.complianceCounts.unspecified} color="#9ca3af" />
        </div>
      </MetricsSection>

      {/* Traceability */}
      <MetricsSection title="Traceability">
        <div className="grid grid-cols-3">
          <StatCard label="Total Trace Links" value={metrics.totalTraceLinks} />
          <StatCard
            label="Traced Requirements"
            value={metrics.tracedRequirements}
            color="#059669"
            percentage={
              metrics.totalRequirements > 0
                ? Math.round((metrics.tracedRequirements / metrics.totalRequirements) * 100)
                : 0
            }
          />
          <StatCard
            label="Untraced"
            value={metrics.untracedRequirements}
            color="#ef4444"
            percentage={
              metrics.totalRequirements > 0
                ? Math.round((metrics.untracedRequirements / metrics.totalRequirements) * 100)
                : 0
            }
          />
        </div>
      </MetricsSection>

      {/* Baselines */}
      {hasBaselines && (
        <MetricsSection title="Baselines">
          <div className="grid grid-cols-3">
            {latestBaseline ? (
              <>
                <StatCard label="Latest Baseline" value={latestBaseline.ref} />
                <StatCard
                  label="Created"
                  value={formatDate(latestBaseline.createdAt)}
                />
                <StatCard
                  label="Requirements Captured"
                  value={latestBaselineRequirementCount}
                />
              </>
            ) : (
              <StatCard label="No baselines" value="—" color="#9ca3af" />
            )}
          </div>
        </MetricsSection>
      )}
    </div>
  );
}
