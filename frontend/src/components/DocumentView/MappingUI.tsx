/**
 * Unified Mapping UI Component
 * Displays field mappings with confidence scores and allows real-time adjustments
 */

import { useState, useEffect } from 'react';
import type { FieldMapping, ParsedDocument } from '../../lib/universal-parser';

interface MappingUIProps {
  parsedDoc: ParsedDocument;
  onMappingChange: (mappings: Map<string, string>) => void;
  onValidationComplete: (valid: number, invalid: number, total: number) => void;
}

const STANDARD_FIELDS = [
  { value: 'text', label: 'Requirement Text (Required)', required: true },
  { value: 'ref', label: 'Reference ID' },
  { value: 'title', label: 'Title' },
  { value: 'pattern', label: 'Pattern (EARS)' },
  { value: 'verification', label: 'Verification Method' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'category', label: 'Category' },
  { value: 'source', label: 'Source' },
  { value: 'rationale', label: 'Rationale' },
  { value: 'tags', label: 'Tags' },
  { value: 'custom', label: 'Custom Attribute' },
  { value: 'ignore', label: 'Ignore Field' }
];

export function MappingUI({ parsedDoc, onMappingChange, onValidationComplete }: MappingUIProps) {
  const [fieldMappings, setFieldMappings] = useState<Map<string, string>>(new Map());
  const [customFieldNames, setCustomFieldNames] = useState<Map<string, string>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Map<number, string[]>>(new Map());

  // Initialize mappings from suggested mappings
  useEffect(() => {
    const initialMappings = new Map<string, string>();
    const customNames = new Map<string, string>();

    parsedDoc.suggestedMappings.forEach(mapping => {
      initialMappings.set(mapping.sourceField, mapping.targetField);
    });

    // Mark custom fields
    parsedDoc.customFields.forEach(field => {
      initialMappings.set(field, 'custom');
      customNames.set(field, field); // Use original field name as custom attribute name
    });

    // Set unmapped fields to ignore
    parsedDoc.fields.forEach(field => {
      if (!initialMappings.has(field.name)) {
        initialMappings.set(field.name, 'ignore');
      }
    });

    setFieldMappings(initialMappings);
    setCustomFieldNames(customNames);
    onMappingChange(initialMappings);
  }, [parsedDoc]);

  // Validate requirements whenever mappings change
  useEffect(() => {
    validateRequirements();
  }, [fieldMappings, customFieldNames]);

  const validateRequirements = () => {
    const errors = new Map<number, string[]>();
    let validCount = 0;
    let invalidCount = 0;

    parsedDoc.rows.forEach((row, index) => {
      const rowErrors: string[] = [];

      // Check if text field is mapped and has value
      let hasText = false;
      fieldMappings.forEach((targetField, sourceField) => {
        if (targetField === 'text') {
          const value = row[sourceField];
          if (value && String(value).trim().length >= 10) {
            hasText = true;
          }
        }
      });

      if (!hasText) {
        rowErrors.push('Requirement text is required (min 10 characters)');
      }

      // Validate pattern if mapped
      fieldMappings.forEach((targetField, sourceField) => {
        if (targetField === 'pattern') {
          const value = row[sourceField];
          if (value && String(value).trim()) {
            const normalizedPattern = normalizePattern(String(value));
            if (!['ubiquitous', 'event', 'state', 'unwanted', 'optional'].includes(normalizedPattern)) {
              rowErrors.push(`Invalid pattern value: "${value}"`);
            }
          }
        }

        if (targetField === 'verification') {
          const value = row[sourceField];
          if (value && String(value).trim()) {
            if (!['Test', 'Analysis', 'Inspection', 'Demonstration'].includes(String(value))) {
              rowErrors.push(`Invalid verification method: "${value}"`);
            }
          }
        }
      });

      if (rowErrors.length > 0) {
        errors.set(index, rowErrors);
        invalidCount++;
      } else {
        validCount++;
      }
    });

    setValidationErrors(errors);
    onValidationComplete(validCount, invalidCount, parsedDoc.rows.length);
  };

  const normalizePattern = (pattern: string): string => {
    if (!pattern) return "";
    const lower = pattern.toLowerCase();

    if (lower.includes('event') || lower.includes('when')) return 'event';
    if (lower.includes('state') || lower.includes('while')) return 'state';
    if (lower === 'ubiquitous' || lower.includes('ubiquitous')) return 'ubiquitous';
    if (lower.includes('unwanted') || lower.includes('if ')) return 'unwanted';
    if (lower.includes('optional') || lower.includes('where')) return 'optional';

    if (['event', 'state', 'ubiquitous', 'unwanted', 'optional'].includes(lower)) {
      return lower;
    }

    return pattern;
  };

  const handleMappingChange = (sourceField: string, targetField: string) => {
    const newMappings = new Map(fieldMappings);
    newMappings.set(sourceField, targetField);

    // If changing to custom, ensure custom name exists
    if (targetField === 'custom' && !customFieldNames.has(sourceField)) {
      const newCustomNames = new Map(customFieldNames);
      newCustomNames.set(sourceField, sourceField);
      setCustomFieldNames(newCustomNames);
    }

    setFieldMappings(newMappings);
    onMappingChange(newMappings);
  };

  const handleCustomNameChange = (sourceField: string, customName: string) => {
    const newCustomNames = new Map(customFieldNames);
    newCustomNames.set(sourceField, customName);
    setCustomFieldNames(newCustomNames);
  };

  const getConfidence = (sourceField: string): number | undefined => {
    const mapping = parsedDoc.suggestedMappings.find(m => m.sourceField === sourceField);
    return mapping?.confidence;
  };

  const getReason = (sourceField: string): string | undefined => {
    const mapping = parsedDoc.suggestedMappings.find(m => m.sourceField === sourceField);
    return mapping?.reason;
  };

  const getConfidenceColor = (confidence?: number): string => {
    if (!confidence) return '#6b7280';
    if (confidence >= 0.9) return '#10b981';
    if (confidence >= 0.7) return '#f59e0b';
    return '#ef4444';
  };

  const getConfidenceLabel = (confidence?: number): string => {
    if (!confidence) return 'Unknown';
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    return 'Low';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Summary */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#f3f4f6',
        borderRadius: '6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            {parsedDoc.format.toUpperCase()} Document
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            {parsedDoc.rows.length} requirements detected, {parsedDoc.fields.length} fields found
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Validation Status</div>
          <div style={{ fontSize: '14px', fontWeight: 500, marginTop: '2px' }}>
            <span style={{ color: '#10b981' }}>
              {parsedDoc.rows.length - validationErrors.size} valid
            </span>
            {validationErrors.size > 0 && (
              <>
                <span style={{ margin: '0 4px', color: '#6b7280' }}>·</span>
                <span style={{ color: '#ef4444' }}>
                  {validationErrors.size} with errors
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Field Mappings */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
          Field Mappings
        </div>
        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          overflow: 'hidden'
        }}>
          {parsedDoc.fields.map((field, index) => {
            const confidence = getConfidence(field.name);
            const reason = getReason(field.name);
            const currentMapping = fieldMappings.get(field.name) || 'ignore';

            return (
              <div
                key={field.name}
                style={{
                  padding: '12px 16px',
                  borderBottom: index < parsedDoc.fields.length - 1 ? '1px solid #e5e7eb' : 'none',
                  backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb'
                }}
              >
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  {/* Source Field */}
                  <div style={{ flex: '0 0 200px' }}>
                    <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '4px' }}>
                      {field.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      {field.sampleValues.filter(v => v).slice(0, 2).map((sample, i) => (
                        <div key={i} style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '180px'
                        }}>
                          "{sample.substring(0, 30)}{sample.length > 30 ? '...' : ''}"
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Confidence Badge */}
                  {confidence !== undefined && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      backgroundColor: `${getConfidenceColor(confidence)}15`,
                      border: `1px solid ${getConfidenceColor(confidence)}40`,
                      fontSize: '11px',
                      fontWeight: 500,
                      color: getConfidenceColor(confidence),
                      height: 'fit-content'
                    }}>
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: getConfidenceColor(confidence)
                      }} />
                      {getConfidenceLabel(confidence)} ({Math.round(confidence * 100)}%)
                    </div>
                  )}

                  {/* Target Field Selector */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <select
                      value={currentMapping}
                      onChange={(e) => handleMappingChange(field.name, e.target.value)}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                      }}
                    >
                      {STANDARD_FIELDS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    {/* Custom field name input */}
                    {currentMapping === 'custom' && (
                      <input
                        type="text"
                        value={customFieldNames.get(field.name) || field.name}
                        onChange={(e) => handleCustomNameChange(field.name, e.target.value)}
                        placeholder="Enter custom attribute name"
                        style={{
                          padding: '6px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                      />
                    )}

                    {/* Reason */}
                    {reason && (
                      <div style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>
                        {reason}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.size > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px', color: '#dc2626' }}>
            Validation Errors ({validationErrors.size} rows)
          </div>
          <div style={{
            border: '1px solid #fecaca',
            borderRadius: '6px',
            backgroundColor: '#fef2f2',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {Array.from(validationErrors.entries()).slice(0, 10).map(([rowIndex, errors]) => (
              <div
                key={rowIndex}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid #fecaca',
                  fontSize: '12px'
                }}
              >
                <div style={{ fontWeight: 500, color: '#991b1b' }}>
                  Row {rowIndex + 1}:
                </div>
                <ul style={{ margin: '4px 0 0 20px', color: '#7f1d1d' }}>
                  {errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            ))}
            {validationErrors.size > 10 && (
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: '#991b1b',
                fontStyle: 'italic'
              }}>
                ... and {validationErrors.size - 10} more rows with errors
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
          Preview (first 3 requirements)
        </div>
        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          overflow: 'hidden',
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          {parsedDoc.rows.slice(0, 3).map((row, index) => {
            const mappedRow: Record<string, any> = {};
            fieldMappings.forEach((targetField, sourceField) => {
              if (targetField === 'custom') {
                const customName = customFieldNames.get(sourceField) || sourceField;
                if (!mappedRow._custom) mappedRow._custom = {};
                mappedRow._custom[customName] = row[sourceField];
              } else if (targetField !== 'ignore') {
                mappedRow[targetField] = row[sourceField];
              }
            });

            return (
              <div
                key={index}
                style={{
                  padding: '12px',
                  borderBottom: index < 2 ? '1px solid #e5e7eb' : 'none',
                  backgroundColor: validationErrors.has(index) ? '#fef2f2' : '#ffffff'
                }}
              >
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                  Requirement {index + 1}
                </div>
                {Object.entries(mappedRow).map(([key, value]) => {
                  if (key === '_custom') {
                    return Object.entries(value as Record<string, any>).map(([customKey, customValue]) => (
                      <div key={`custom-${customKey}`} style={{ fontSize: '12px', marginTop: '4px' }}>
                        <span style={{ fontWeight: 500, color: '#7c3aed' }}>{customKey}:</span>{' '}
                        <span>{String(customValue).substring(0, 100)}{String(customValue).length > 100 ? '...' : ''}</span>
                      </div>
                    ));
                  }
                  return (
                    <div key={key} style={{ fontSize: '12px', marginTop: '4px' }}>
                      <span style={{ fontWeight: 500 }}>{key}:</span>{' '}
                      <span>{String(value).substring(0, 100)}{String(value).length > 100 ? '...' : ''}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { customFieldNames as getCustomFieldNames };
