export interface Issue { sourcePath: string; line: number | null; reason: string }
export interface SourceFile { path: string; hash: string; lines: number | null }
export interface SymbolInfo { sourcePath: string; line: number; kind: string; name: string }
export interface DepEdge { sourcePath: string; line: number; include: string; kind: 'local' | 'system' | 'unresolved'; targetPath?: string }
export interface ProjectModel { root: string; discoveredFiles?: string[]; summaries?: DeclarationSummary[]; files: SourceFile[]; symbols: SymbolInfo[]; deps: DepEdge[]; unsupported: Issue[]; stats: { files: number; lines: number }; status: 'complete' | 'partial' }
export interface DeclarationSummary { sourcePath: string; line: number; signature: string }
export interface Chunk { id: string; files: string[]; contextBundle: DeclarationSummary[]; estTokens: number; deps: string[] }
export interface ChunkResult { budgetTokens: number; estimator: string; chunks: Chunk[]; unassigned: Issue[]; unsupported: Issue[]; status: 'complete' | 'partial' }