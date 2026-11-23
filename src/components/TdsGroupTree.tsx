import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';

export interface GroupTreeLedger {
    id: string;
    ledgerName: string;
    sectionCode: string | null;
    inheritedSectionCode: string | null;
    inheritedGroupName: string | null;
    effectiveSectionCode: string | null;
    isTdsLedger: boolean;
    userValidated: boolean;
}

export interface GroupTreeNode {
    key: string;
    name: string;
    path: string[];
    /** Virtual nodes (e.g. "Excluded from TDS") are not Tally groups and cannot be mapped */
    virtual?: boolean;
    explicitSectionCode: string | null;
    source: 'auto' | 'manual' | null;
    effectiveSectionCode: string | null;
    inheritedFromPath: string[] | null;
    ledgerCount: number;
    children: GroupTreeNode[];
    ledgers: GroupTreeLedger[];
}

export interface GroupTreeData {
    roots: GroupTreeNode[];
    totalLedgers: number;
    templateCount: number;
}

export interface TdsSectionOption {
    old_section: string;
    nature_of_payment: string;
}

interface Props {
    data: GroupTreeData | null;
    sections: TdsSectionOption[];
    onSetGroupSection: (path: string[], sectionCode: string | null) => void;
    onSetLedgerSection: (ledgerName: string, sectionCode: string | null) => void;
    onClearLedgerOverride: (ledgerName: string) => void;
    /** Show a "TDS ledger" tick box on each ledger (used for Duties & Taxes) */
    showTds?: boolean;
    onSetLedgerTds?: (ledgerName: string, isTds: boolean, sectionCode: string | null) => void;
    /** Tick-only mode: no section dropdowns (ledgers are mapped as TDS ledgers, sections come from their names) */
    tickOnly?: boolean;
}

interface RowCtx {
    sections: TdsSectionOption[];
    onSetGroupSection: Props['onSetGroupSection'];
    onSetLedgerSection: Props['onSetLedgerSection'];
    onClearLedgerOverride: Props['onClearLedgerOverride'];
    showTds: boolean;
    tickOnly: boolean;
    onSetLedgerTds?: Props['onSetLedgerTds'];
}

const INHERIT = '__inherit__';
export const EXCLUDE = 'EXCLUDE';
const EXCLUDE_OPTION: TdsSectionOption = { old_section: EXCLUDE, nature_of_payment: 'Excluded from TDS (no TDS)' };

function sectionLabel(code: string): string {
    return code === EXCLUDE ? 'Excluded' : code;
}

function SectionBadge({ code, source }: { code: string | null; source?: 'auto' | 'manual' | null }) {
    if (!code) return <span className="text-[10px] text-slate-400 font-semibold">not mapped</span>;
    const excluded = code === EXCLUDE;
    return (
        <span className="inline-flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold ${excluded ? 'bg-rose-500/10 border border-rose-500/20 text-rose-600' : 'bg-purple-500/10 border border-purple-500/20 text-purple-500'}`}>
                {sectionLabel(code)}
            </span>
            {source && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${source === 'auto' ? 'bg-sky-500/10 text-sky-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                    {source}
                </span>
            )}
        </span>
    );
}

function LedgerRow({ ledger, depth, ctx }: { ledger: GroupTreeLedger; depth: number; ctx: RowCtx }) {
    const hasOverride = !!ledger.sectionCode;
    const value = hasOverride ? ledger.sectionCode! : INHERIT;
    const inheritLabel = ledger.inheritedSectionCode
        ? `Inherit (${sectionLabel(ledger.inheritedSectionCode)})`
        : 'Unmapped';
    return (
        <div className="flex items-center justify-between gap-3 py-0.5 pr-2 hover:bg-slate-50 rounded" style={{ paddingLeft: depth * 16 + 28 }}>
            <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-800 truncate" title={ledger.ledgerName}>{ledger.ledgerName}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {ctx.showTds && (
                    <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 cursor-pointer" title="Mark as a TDS payable ledger">
                        <input
                            type="checkbox"
                            checked={ledger.isTdsLedger}
                            onChange={(e) => ctx.onSetLedgerTds && ctx.onSetLedgerTds(ledger.ledgerName, e.target.checked, ledger.sectionCode)}
                            className="w-3.5 h-3.5 rounded text-purple-600 border-slate-300 cursor-pointer"
                        />
                        TDS
                    </label>
                )}
                {!hasOverride && ledger.inheritedGroupName && (
                    <span className="text-[10px] text-slate-500">inherited from <b>{ledger.inheritedGroupName}</b></span>
                )}
                {!ctx.tickOnly && <select
                    value={value}
                    onChange={(e) => {
                        if (e.target.value === INHERIT) ctx.onClearLedgerOverride(ledger.ledgerName);
                        else ctx.onSetLedgerSection(ledger.ledgerName, e.target.value);
                    }}
                    className="bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-900 font-medium focus:border-purple-500 outline-none max-w-[260px]"
                >
                    <option value={INHERIT}>{inheritLabel}</option>
                    {ctx.sections.map(sec => <option key={sec.old_section} value={sec.old_section}>{sec.old_section === EXCLUDE ? 'EXCLUDE - not subject to TDS' : `${sec.old_section} - ${sec.nature_of_payment}`}</option>)}
                </select>}
            </div>
        </div>
    );
}

function GroupNode({ node, depth, ctx }: { node: GroupTreeNode; depth: number; ctx: RowCtx }) {
    const [open, setOpen] = useState(depth === 0);
    const hasChildren = node.children.length > 0 || node.ledgers.length > 0;
    const groupValue = node.explicitSectionCode || '';
    const inheritedFrom = node.inheritedFromPath && node.inheritedFromPath.length ? node.inheritedFromPath[node.inheritedFromPath.length - 1] : null;

    return (
        <div>
            <div className="flex items-center justify-between gap-3 py-1 pr-2 hover:bg-slate-50 rounded" style={{ paddingLeft: depth * 16 + 4 }}>
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    disabled={!hasChildren}
                    className="flex items-center gap-2 min-w-0 text-left disabled:opacity-60"
                >
                    {hasChildren ? (open ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />) : <span className="w-4 h-4 shrink-0" />}
                    <Folder className={`w-4 h-4 shrink-0 ${node.virtual ? 'text-rose-500' : 'text-amber-500'}`} />
                    <span className="text-sm font-semibold text-slate-900 truncate" title={node.path.join(' > ')}>{node.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 shrink-0">{node.ledgerCount} ledger{node.ledgerCount === 1 ? '' : 's'}</span>
                </button>
                {!node.virtual && !ctx.tickOnly && (
                    <div className="flex items-center gap-2 shrink-0">
                        {node.explicitSectionCode ? <SectionBadge code={node.explicitSectionCode} source={node.source} /> : (
                            node.effectiveSectionCode
                                ? <span className="text-[10px] text-indigo-600 font-semibold">inherits {sectionLabel(node.effectiveSectionCode)}{inheritedFrom ? ` from ${inheritedFrom}` : ''}</span>
                                : <SectionBadge code={null} />
                        )}
                        <select
                            value={groupValue}
                            onChange={(e) => ctx.onSetGroupSection(node.path, e.target.value || null)}
                            className="bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-900 font-medium focus:border-purple-500 outline-none max-w-[260px]"
                            title="Section for this group (applies to all ledgers and sub-groups beneath it)"
                        >
                            <option value="">Inherit / none</option>
                            {ctx.sections.map(sec => <option key={sec.old_section} value={sec.old_section}>{sec.old_section === EXCLUDE ? 'EXCLUDE - not subject to TDS' : `${sec.old_section} - ${sec.nature_of_payment}`}</option>)}
                        </select>
                    </div>
                )}
            </div>
            {open && (
                <div>
                    {node.children.map(child => (
                        <GroupNode key={child.key} node={child} depth={depth + 1} ctx={ctx} />
                    ))}
                    {node.ledgers.map(l => (
                        <LedgerRow key={l.id || l.ledgerName} ledger={l} depth={depth} ctx={ctx} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function TdsGroupTree({ data, sections, onSetGroupSection, onSetLedgerSection, onClearLedgerOverride, showTds = false, onSetLedgerTds, tickOnly = false }: Props) {
    if (!data) return <p className="text-xs text-slate-500">Fetch vouchers from Tally to load this tree.</p>;
    if (data.roots.length === 0) return <p className="text-xs text-slate-500">No ledgers yet. Fetch vouchers from Tally to build this tree.</p>;
    const options = [...sections.filter(s => s.old_section !== EXCLUDE), EXCLUDE_OPTION];
    const ctx: RowCtx = { sections: options, onSetGroupSection, onSetLedgerSection, onClearLedgerOverride, showTds, tickOnly, onSetLedgerTds };
    return (
        <div className="border border-slate-200 rounded-xl bg-white p-1 max-h-[560px] overflow-auto">
            <p className="text-[11px] text-slate-500 px-2 pb-1">
                {data.totalLedgers} ledgers · {data.templateCount} group mappings. Set a section on any group to apply it to everything beneath it; a ledger's own section always overrides. Choose EXCLUDE to move a group or ledger out of TDS.
            </p>
            {data.roots.map(root => (
                <GroupNode key={root.key} node={root} depth={0} ctx={ctx} />
            ))}
        </div>
    );
}
