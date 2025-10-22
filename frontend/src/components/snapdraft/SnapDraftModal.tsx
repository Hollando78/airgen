import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from '../Modal';
import { Button } from '../ui/button';
import { useSnapDraftAnalyze, useSnapDraftGenerate, createDownloadHelper, type AnalysisResponse } from '../../hooks/useSnapDraftApi';
import { useApiClient } from '../../lib/client';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Download, AlertCircle, CheckCircle, Loader2, Save, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';

export interface SnapDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementId: string;
  elementType: 'block' | 'interface';
  elementName: string;
  tenant: string;
  project: string;
}

type Step = 1 | 2 | 3;
type ModeOverride = 'recommended' | 'force_technical' | 'force_visualization';

export const SnapDraftModal: React.FC<SnapDraftModalProps> = ({
  isOpen,
  onClose,
  elementId,
  elementType,
  elementName,
  tenant,
  project,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [modeOverride, setModeOverride] = useState<ModeOverride>('recommended');

  const [options, setOptions] = useState({
    style: 'engineering' as const,
    outputs: ['dxf', 'svg'] as ('dxf' | 'svg')[],
    units: 'mm' as const,
    scale: '1:1',
    paper: 'A4' as const,
    orientation: 'landscape' as const,
  });

  const [svgBlobUrl, setSvgBlobUrl] = useState<string | null>(null);
  const [savingToDocuments, setSavingToDocuments] = useState<'svg' | 'dxf' | null>(null);
  const [savedFiles, setSavedFiles] = useState<{ svg?: boolean; dxf?: boolean }>({});

  const [availableContext, setAvailableContext] = useState<{
    documents: Array<{ id: string; name: string; description?: string }>;
    requirements: Array<{ id: string; title: string; text?: string }>;
    diagrams: Array<{ id: string; name: string; description?: string }>;
  } | null>(null);

  const [selectedContext, setSelectedContext] = useState<{
    documents: string[];
    requirements: string[];
    diagrams: string[];
  }>({ documents: [], requirements: [], diagrams: [] });

  const [loadingContext, setLoadingContext] = useState(false);

  const api = useApiClient();
  const queryClient = useQueryClient();
  const analyzeMutation = useSnapDraftAnalyze(tenant, project);
  const generateMutation = useSnapDraftGenerate(tenant, project);
  const downloadFile = useMemo(() => createDownloadHelper(api), [api]);

  // Fetch available context when modal opens
  useEffect(() => {
    const fetchContext = async () => {
      if (!isOpen) return;

      setLoadingContext(true);
      try {
        const context = await api.getSnapDraftContext(tenant, project, elementType, elementId);
        setAvailableContext(context);

        // Auto-select all diagrams by default
        setSelectedContext({
          documents: [],
          requirements: [],
          diagrams: context.diagrams.map(d => d.id),
        });
      } catch (error) {
        console.error('Failed to fetch context:', error);
      } finally {
        setLoadingContext(false);
      }
    };

    fetchContext();
  }, [isOpen, api, tenant, project, elementType, elementId]);

  // Fetch SVG with auth and create blob URL for preview
  useEffect(() => {
    let blobUrl: string | null = null;

    const fetchSvgPreview = async () => {
      if (generateMutation.isSuccess && generateMutation.data?.drawingId) {
        try {
          const blob = await api.downloadSnapDraftFile(tenant, generateMutation.data.drawingId, 'svg');
          blobUrl = window.URL.createObjectURL(blob);
          setSvgBlobUrl(blobUrl);
        } catch (error) {
          console.error('Failed to fetch SVG preview:', error);
        }
      }
    };

    fetchSvgPreview();

    return () => {
      if (blobUrl) {
        window.URL.revokeObjectURL(blobUrl);
      }
      setSvgBlobUrl(null);
    };
  }, [generateMutation.isSuccess, generateMutation.data?.drawingId, api, tenant]);

  const handleAnalyze = async () => {
    const result = await analyzeMutation.mutateAsync({
      elementId,
      elementType,
      contextDocuments: selectedContext.documents,
      contextRequirements: selectedContext.requirements,
      referenceDiagrams: selectedContext.diagrams,
      style: options.style,
    });

    setAnalysisResult(result);
    setModeOverride('recommended');
    setStep(2);
  };

  const handleGenerate = async () => {
    const effectiveMode = modeOverride === 'recommended'
      ? analysisResult!.mode
      : modeOverride === 'force_technical'
        ? 'technical_drawing'
        : 'visualization';

    await generateMutation.mutateAsync({
      elementId,
      elementType,
      contextDocuments: selectedContext.documents,
      contextRequirements: selectedContext.requirements,
      referenceDiagrams: selectedContext.diagrams,
      style: options.style,
      outputs: options.outputs,
      options: {
        units: options.units,
        scale: options.scale,
        paper: options.paper,
        orientation: options.orientation,
      },
      forcedMode: modeOverride !== 'recommended' ? effectiveMode : undefined,
    });

    setStep(3);
  };

  const handleDownload = async (format: 'dxf' | 'svg' | 'json') => {
    if (!generateMutation.data) return;

    const extensions: Record<string, string> = {
      dxf: '.dxf',
      svg: '.svg',
      json: '.json',
    };

    const filename = `${elementName.replace(/[^a-zA-Z0-9]/g, '_')}_snapdraft${extensions[format]}`;
    await downloadFile(tenant, generateMutation.data.drawingId, format, filename);
  };

  const handleSaveToDocuments = async (format: 'dxf' | 'svg') => {
    if (!generateMutation.data) return;

    try {
      setSavingToDocuments(format);

      const blob = await api.downloadSnapDraftFile(tenant, generateMutation.data.drawingId, format);
      const mimeTypes = { dxf: 'application/dxf', svg: 'image/svg+xml' };
      const filename = `${elementName.replace(/[^a-zA-Z0-9]/g, '_')}_snapdraft.${format}`;
      const file = new File([blob], filename, { type: mimeTypes[format] });

      await api.uploadSurrogateDocument({
        tenant,
        projectKey: project,
        file,
        name: `SnapDraft: ${elementName}`,
        description: `Technical drawing generated by SnapDraft AI (${format.toUpperCase()})`,
      });

      // Invalidate documents cache so the new document appears immediately in lists
      await queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });

      setSavedFiles(prev => ({ ...prev, [format]: true }));
    } catch (error) {
      console.error(`Failed to save ${format} to documents:`, error);
      alert(`Failed to save ${format.toUpperCase()} file to documents. Please try again.`);
    } finally {
      setSavingToDocuments(null);
    }
  };

  const handleNewGeneration = () => {
    setStep(1);
    setAnalysisResult(null);
    setModeOverride('recommended');
    generateMutation.reset();
    analyzeMutation.reset();
    setSvgBlobUrl(null);
    setSavedFiles({});
  };

  const getEffectiveMode = () => {
    if (!analysisResult) return null;
    if (modeOverride === 'recommended') return analysisResult.mode;
    return modeOverride === 'force_technical' ? 'technical_drawing' : 'visualization';
  };

  const effectiveMode = getEffectiveMode();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`SnapDraft: "${elementName}"`}
      size="xl"
    >
      <div className="flex flex-col gap-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            1
          </div>
          <div className={`w-16 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            2
          </div>
          <div className={`w-16 h-1 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            3
          </div>
        </div>

        {/* Step 1: Context Selection */}
        {step === 1 && (
          <>
            {/* Element Info */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Element Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Type:</span>
                  <span className="ml-2 text-gray-900">{elementType === 'block' ? 'Block' : 'Interface'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Name:</span>
                  <span className="ml-2 text-gray-900">{elementName}</span>
                </div>
              </div>
            </div>

            {/* Context Selection */}
            {loadingContext ? (
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm text-gray-600">Loading available context...</span>
                </div>
              </div>
            ) : availableContext && (availableContext.documents.length > 0 || availableContext.requirements.length > 0 || availableContext.diagrams.length > 0) ? (
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-semibold text-sm text-gray-700 mb-4">
                  Select Context
                  <span className="ml-2 text-xs font-normal text-gray-500">(optional)</span>
                </h3>

                {/* Documents */}
                {availableContext.documents.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Documents ({availableContext.documents.length})</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {availableContext.documents.map((doc) => (
                        <label key={doc.id} className="flex items-start p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedContext.documents.includes(doc.id)}
                            onChange={(e) => {
                              setSelectedContext({
                                ...selectedContext,
                                documents: e.target.checked
                                  ? [...selectedContext.documents, doc.id]
                                  : selectedContext.documents.filter(id => id !== doc.id),
                              });
                            }}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{doc.name}</div>
                            {doc.description && (
                              <div className="text-xs text-gray-500 truncate">{doc.description}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Requirements */}
                {availableContext.requirements.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Requirements ({availableContext.requirements.length})</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {availableContext.requirements.map((req) => (
                        <label key={req.id} className="flex items-start p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedContext.requirements.includes(req.id)}
                            onChange={(e) => {
                              setSelectedContext({
                                ...selectedContext,
                                requirements: e.target.checked
                                  ? [...selectedContext.requirements, req.id]
                                  : selectedContext.requirements.filter(id => id !== req.id),
                              });
                            }}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{req.title}</div>
                            {req.text && (
                              <div className="text-xs text-gray-500 line-clamp-2">{req.text}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diagrams */}
                {availableContext.diagrams.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">
                      Diagrams ({availableContext.diagrams.length})
                      <span className="ml-2 text-xs font-normal text-green-600">auto-selected</span>
                    </h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {availableContext.diagrams.map((diagram) => (
                        <label key={diagram.id} className="flex items-start p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedContext.diagrams.includes(diagram.id)}
                            onChange={(e) => {
                              setSelectedContext({
                                ...selectedContext,
                                diagrams: e.target.checked
                                  ? [...selectedContext.diagrams, diagram.id]
                                  : selectedContext.diagrams.filter(id => id !== diagram.id),
                              });
                            }}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{diagram.name}</div>
                            {diagram.description && (
                              <div className="text-xs text-gray-500 truncate">{diagram.description}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Analysis Progress */}
            {analyzeMutation.isPending && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  <div>
                    <h4 className="font-semibold text-sm text-blue-900">Analyzing Requirements...</h4>
                    <p className="text-xs text-blue-700 mt-1">AI is evaluating technical detail sufficiency</p>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Error */}
            {analyzeMutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm text-red-900">Analysis Failed</h4>
                    <p className="text-xs text-red-700 mt-1">
                      {(analyzeMutation.error as any)?.message || 'An unexpected error occurred. Please try again.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 2: Analysis Results + Configuration */}
        {step === 2 && analysisResult && (
          <>
            {/* Analysis Results */}
            <div className={`p-4 rounded-lg border ${
              analysisResult.suitabilityScore >= 7 ? 'bg-green-50 border-green-200' :
              analysisResult.suitabilityScore >= 5 ? 'bg-yellow-50 border-yellow-200' :
              'bg-orange-50 border-orange-200'
            }`}>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                {analysisResult.suitabilityScore >= 7 ? (
                  <TrendingUp className="w-4 h-4 text-green-600" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-orange-600" />
                )}
                AI Analysis Results
              </h3>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Recommended Mode:</span>
                  <span className="ml-2 font-semibold">
                    {analysisResult.mode === 'technical_drawing' ? 'Technical Drawing' : 'Visualization'}
                  </span>
                  {analysisResult.visualizationType && (
                    <span className="ml-1 text-xs">({analysisResult.visualizationType === 'dalle' ? 'AI Image' : 'Diagram'})</span>
                  )}
                </div>

                <div>
                  <span className="font-medium">Suitability Score:</span>
                  <span className="ml-2">{analysisResult.suitabilityScore}/10</span>
                </div>

                <div>
                  <p className="font-medium mb-1">Reasoning:</p>
                  <p className="text-xs leading-relaxed">{analysisResult.reasoning}</p>
                </div>

                {analysisResult.issues.length > 0 && (
                  <div>
                    <p className="font-medium mb-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Issues Found:
                    </p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      {analysisResult.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Mode Override */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Mode Selection</h3>
              <div className="space-y-2">
                <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="mode"
                    checked={modeOverride === 'recommended'}
                    onChange={() => setModeOverride('recommended')}
                    className="mt-0.5 mr-3"
                  />
                  <div>
                    <div className="font-medium text-sm">Use AI Recommendation</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {analysisResult.mode === 'technical_drawing' ? 'Technical Drawing' : 'Visualization'}
                      {' (Score: '}{analysisResult.suitabilityScore}/10)
                    </div>
                  </div>
                </label>

                <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="mode"
                    checked={modeOverride === 'force_technical'}
                    onChange={() => setModeOverride('force_technical')}
                    className="mt-0.5 mr-3"
                  />
                  <div>
                    <div className="font-medium text-sm">Force Technical Drawing</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Generate CAD-compatible DXF/SVG regardless of detail level
                    </div>
                  </div>
                </label>

                <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="mode"
                    checked={modeOverride === 'force_visualization'}
                    onChange={() => setModeOverride('force_visualization')}
                    className="mt-0.5 mr-3"
                  />
                  <div>
                    <div className="font-medium text-sm">Force Visualization</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Generate AI image or diagram for conceptual representation
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Conditional Configuration */}
            {effectiveMode === 'technical_drawing' ? (
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="font-semibold text-sm text-gray-700 mb-4">Drawing Specifications</h3>

                <div className="grid grid-cols-2 gap-4">
                  {/* Style */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
                    <select
                      value={options.style}
                      onChange={(e) => setOptions({ ...options, style: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="engineering">Engineering (ISO 128)</option>
                      <option value="architectural">Architectural (AIA)</option>
                      <option value="schematic">Schematic (IEEE 315)</option>
                    </select>
                  </div>

                  {/* Units */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Units</label>
                    <select
                      value={options.units}
                      onChange={(e) => setOptions({ ...options, units: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="mm">Millimeters</option>
                      <option value="in">Inches</option>
                    </select>
                  </div>

                  {/* Scale */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scale</label>
                    <select
                      value={options.scale}
                      onChange={(e) => setOptions({ ...options, scale: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="1:1">1:1 (Full Scale)</option>
                      <option value="1:2">1:2 (Half Scale)</option>
                      <option value="1:5">1:5</option>
                      <option value="1:10">1:10</option>
                      <option value="2:1">2:1 (Double)</option>
                    </select>
                  </div>

                  {/* Paper Size */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Paper Size</label>
                    <select
                      value={options.paper}
                      onChange={(e) => setOptions({ ...options, paper: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="A4">A4 (210 × 297 mm)</option>
                      <option value="A3">A3 (297 × 420 mm)</option>
                      <option value="A2">A2 (420 × 594 mm)</option>
                      <option value="LETTER">Letter (8.5 × 11 in)</option>
                      <option value="TABLOID">Tabloid (11 × 17 in)</option>
                    </select>
                  </div>

                  {/* Orientation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Orientation</label>
                    <select
                      value={options.orientation}
                      onChange={(e) => setOptions({ ...options, orientation: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="landscape">Landscape</option>
                      <option value="portrait">Portrait</option>
                    </select>
                  </div>

                  {/* Outputs */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Outputs</label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={options.outputs.includes('dxf')}
                          onChange={(e) => {
                            const newOutputs = e.target.checked
                              ? [...options.outputs, 'dxf' as const]
                              : options.outputs.filter(o => o !== 'dxf');
                            setOptions({ ...options, outputs: newOutputs });
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">DXF</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={options.outputs.includes('svg')}
                          onChange={(e) => {
                            const newOutputs = e.target.checked
                              ? [...options.outputs, 'svg' as const]
                              : options.outputs.filter(o => o !== 'svg');
                            setOptions({ ...options, outputs: newOutputs });
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">SVG</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-sm text-blue-900 mb-2">Visualization Mode</h3>
                <p className="text-sm text-blue-700">
                  Will generate {analysisResult.visualizationType === 'dalle' ? 'an AI-powered photorealistic image' : 'a semi-technical diagram'} based on the available requirements.
                  No additional configuration needed.
                </p>
              </div>
            )}

            {/* Generation Progress */}
            {generateMutation.isPending && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  <div>
                    <h4 className="font-semibold text-sm text-blue-900">Generating...</h4>
                    <p className="text-xs text-blue-700 mt-1">
                      {effectiveMode === 'technical_drawing'
                        ? 'AI is creating your technical drawing specification'
                        : 'AI is generating your visualization'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Generation Error */}
            {generateMutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm text-red-900">Generation Failed</h4>
                    <p className="text-xs text-red-700 mt-1">
                      {(generateMutation.error as any)?.message || 'An unexpected error occurred. Please try again.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 3: Results */}
        {step === 3 && generateMutation.isSuccess && generateMutation.data && (
          <>
            {/* SVG Preview */}
            {svgBlobUrl && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Preview
                </h4>
                <div className="bg-gray-50 rounded border border-gray-200 p-4 overflow-auto max-h-96">
                  <img
                    src={svgBlobUrl}
                    alt="Drawing preview"
                    className="max-w-full h-auto"
                  />
                </div>
              </div>
            )}

            {/* AI Reasoning */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-sm text-blue-900 mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                AI Reasoning
              </h4>

              {/* Technical Drawing Reasoning */}
              {generateMutation.data.mode === 'technical_drawing' && (
                <>
                  {generateMutation.data.reasoning.dimensionsAssumed?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-blue-800">Assumptions:</p>
                      <ul className="list-disc list-inside text-xs text-blue-700 mt-1">
                        {generateMutation.data.reasoning.dimensionsAssumed.map((assumption: string, i: number) => (
                          <li key={i}>{assumption}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {generateMutation.data.reasoning.warnings?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-yellow-800 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Warnings:
                      </p>
                      <ul className="list-disc list-inside text-xs text-yellow-700 mt-1">
                        {generateMutation.data.reasoning.warnings.map((warning: string, i: number) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* Visualization Reasoning */}
              {generateMutation.data.mode === 'visualization' && (
                <>
                  <div className="mb-2">
                    <p className="text-xs font-medium text-blue-800">Mode: Visualization</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Generated {generateMutation.data.visualizationType === 'dalle' ? 'AI image' : 'diagram'} instead of technical drawing
                    </p>
                  </div>

                  <div className="mb-2">
                    <p className="text-xs font-medium text-blue-800">Suitability Score: {generateMutation.data.reasoning.suitabilityScore}/10</p>
                  </div>

                  {generateMutation.data.reasoning.whyNotDrawing?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-yellow-800 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Why Not Technical Drawing:
                      </p>
                      <ul className="list-disc list-inside text-xs text-yellow-700 mt-1">
                        {generateMutation.data.reasoning.whyNotDrawing.map((reason: string, i: number) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Download and Save Actions */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-700">Actions</h4>

              {/* DXF Actions */}
              {generateMutation.data.files.dxf && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => handleDownload('dxf')}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download DXF
                  </Button>
                  <Button
                    onClick={() => handleSaveToDocuments('dxf')}
                    variant="outline"
                    disabled={savingToDocuments === 'dxf' || savedFiles.dxf}
                    className="flex items-center gap-2"
                  >
                    {savingToDocuments === 'dxf' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : savedFiles.dxf ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Saved to Documents
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save DXF to Documents
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* SVG Actions */}
              {generateMutation.data.files.svg && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => handleDownload('svg')}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download SVG
                  </Button>
                  <Button
                    onClick={() => handleSaveToDocuments('svg')}
                    variant="outline"
                    disabled={savingToDocuments === 'svg' || savedFiles.svg}
                    className="flex items-center gap-2"
                  >
                    {savingToDocuments === 'svg' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : savedFiles.svg ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Saved to Documents
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save SVG to Documents
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* JSON Spec */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => handleDownload('json')}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  View JSON Spec
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Footer Actions */}
        <div className="flex justify-between gap-3 pt-4 border-t border-gray-200">
          <div>
            {step === 2 && (
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            {step === 3 && (
              <Button
                variant="outline"
                onClick={handleNewGeneration}
                className="flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                New Generation
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {step === 1 && (
              <Button
                onClick={handleAnalyze}
                disabled={analyzeMutation.isPending}
                className="flex items-center gap-2"
              >
                {analyzeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Analyze Requirements
                  </>
                )}
              </Button>
            )}
            {step === 2 && !generateMutation.isSuccess && (
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || (effectiveMode === 'technical_drawing' && options.outputs.length === 0)}
                className="flex items-center gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    Generate
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
