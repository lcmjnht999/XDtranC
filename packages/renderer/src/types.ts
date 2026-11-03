export interface PreviewFile {
  path: string;
  code: string;
}

export interface WorkbenchFile {
  path: string;
  lines: number;
  chunkId: string | null;
  failed: boolean;
  unsupported: boolean;
  outputs: string[];
}

export interface CoverageSummary {
  status: 'complete' | 'partial';
  checkedSymbols: number;
  mappedSymbols: number;
  declaredUnsupported: number;
  gaps: unknown[];
  emptyFiles: string[];
  stubFiles: string[];
}

export interface Summary {
  inputFiles: number;
  inputLines: number;
  outputFiles: number;
  outputLines: number;
  lineRetention: number | null;
  coverage: CoverageSummary;
  stubCheck: 'passed' | 'failed';
  failedChunks: number;
  unsupported: number;
  unassigned: number;
  simulated: boolean;
}

export interface OutputFile {
  path: string;
  code: string;
}

export interface ConversionResult {
  chunkId: string;
  output: { outputs: OutputFile[] };
}

export interface ConversionReport {
  status: 'complete' | 'partial' | 'failed';
  simulated: boolean;
  model: string;
  results: ConversionResult[];
  unsupported: unknown[];
  failedChunks: unknown[];
  unassigned: unknown[];
}

export interface RunResult {
  previews: PreviewFile[];
  report: ConversionReport;
  files: WorkbenchFile[];
  summary: Summary;
}

export interface RunConfig {
  provider: 'mock' | 'ollama';
  model: string;
  endpoint: string;
  timeoutMs: number;
}

export interface ExportOptions {
  cjpm?: boolean;
  packageName?: string;
}

export interface ExportResult {
  path: string;
  status: string;
  layout?: 'flat' | 'cjpm';
}

export interface WorkbenchApi {
  choose(kind: 'dir' | 'zip'): Promise<string | null>;
  paste(payload: { path: string; code: string }): Promise<string>;
  run(config: RunConfig): Promise<RunResult>;
  cancel(): Promise<boolean>;
  export(format: 'dir' | 'zip', options?: ExportOptions): Promise<ExportResult | null>;
  status(callback: (text: string) => void): () => void;
}
