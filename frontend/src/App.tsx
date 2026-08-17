import { useCallback, useEffect, useState } from 'react'
import { BookOpen, BrainCircuit, Check, CheckCircle2, ClipboardList, Clock3, Download, Eye, FileText, Image, Languages, Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Stats = { platform_count: number; brand_count: number; faq_count: number; knowledge_count: number; status: string }
type Brand = { id: number; brand_code: string; name: string; company: string; alias: string; founded: string; region: string; products: string; target_customers: string; core_capability: string; certifications: string; constraint: string }
type Faq = { id: number; faq_code: string; category: string; question: string; answer: string }
type Knowledge = { id: number; name: string; category: string; content: string }
type Log = { id: number; category: '新增' | '修改' | '生成' | '查询' | '删除' | '其他'; action: string; detail: string; created_at: string }
type GeoPageRow = { title: string; domain: string; site_name?: string; snippet?: string; mentions: number | null; date: string; url: string }
type GeoDomain = { domain: string; mentions: number | null; share: string }
type GeoPlatformResult = { model: string; summary: string; domains: GeoDomain[]; pages: GeoPageRow[] }
type GeoProviderFailure = { model: string; error: string }
type GeoReport = { id: number; report_code: string; keyword: string; provider_names: string[]; created_at: string }
type GeoAggregateDomain = { domain: string; site_name: string; confirmed_mentions: number; source_records: number; model_count: number; page_count: number; share: string; models: { name: string; confirmed_mentions: number; source_records: number }[] }
type GeoAggregatePage = { title: string; url: string; domain: string; site_name: string; date: string; confirmed_mentions: number; source_records: number; model_count: number; models: { name: string; confirmed_mentions: number; source_records: number }[] }
type GeoAggregate = { total_confirmed_mentions: number; total_source_records: number; domain_count: number; page_count: number; domains: GeoAggregateDomain[]; pages: GeoAggregatePage[] }
type GeoResult = { keyword: string; platforms: string[]; attempted_platforms?: string[]; failures?: Record<string, GeoProviderFailure>; mention_rate: number; source_count: number; page_count: number; results: Record<string, GeoPlatformResult>; report: GeoReport; aggregate: GeoAggregate }
type ProviderType = 'qwen' | 'hunyuan' | 'volcengine' | 'tencent_search'
type ModelProvider = { id: number; name: string; base_url: string; model: string; provider_type: ProviderType; protocol: 'responses' | 'chat_completions'; enabled: boolean; has_api_key: boolean; has_api_secret: boolean; has_aux_api_key: boolean }
type MediaProvider = { id: number; name: string; media_type: 'image' | 'video'; base_url: string; model: string; enabled: boolean; has_api_key: boolean }
type Article = { id: number; article_code: string; input_text: string; supplemental_prompt: string; content: string; brand_id: number; brand_name: string; include_faq: boolean; include_knowledge: boolean; image_prompt: string; selected_images: string[]; created_at: string; content_saved_at: string | null; confirmed_at: string | null; reference_counts?: { faq: number; knowledge: number } }
type TranslationTask = { id: number; article_id: number; language: 'English' | 'Bahasa Indonesia' | '日语'; status: 'processing' | 'completed' | 'failed'; progress: number; error: string; created_at: string; completed_at: string | null }
type Page = 'geo' | 'brands' | 'faqs' | 'knowledge' | 'compose' | 'logs'

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || '请求失败')
  return response.json()
}

const nav = [
  ['geo', 'GEO 结果查询', '查看关键词在生成式引擎的表现', Search],
  ['brands', '品牌管理', '维护品牌基础资料与约束', Settings2],
  ['faqs', 'FAQ 管理', '沉淀可复用的标准问答', ClipboardList],
  ['knowledge', '知识库', '维护企业素材', BookOpen],
  ['compose', '一键成文', '把输入与素材转成图文内容', Sparkles],
  ['logs', '日志中心', '回溯关键操作', FileText],
] as const

const FAQ_CATEGORIES = ['采购流程', '产品描述与认证', '价格与起订量', '售后与质保']

function PageHeader({ code, title, description, children }: { code: string; title: string; description: string; children?: React.ReactNode }) {
  return <header className="page-header"><span className="code">{code}</span><div><h1>{title}</h1><p>{description}</p></div><div className="header-actions">{children}</div></header>
}

function Modal({ title, children, onClose, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className={`modal ${className}`} onMouseDown={event => event.stopPropagation()}><header><h2>{title}</h2><button className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button></header>{children}</section></div>
}

export default function App() {
  const [page, setPage] = useState<Page>('geo')
  const [stats, setStats] = useState<Stats>({ platform_count: 0, brand_count: 0, faq_count: 0, knowledge_count: 0, status: 'online' })
  const [brands, setBrands] = useState<Brand[]>([])
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [knowledge, setKnowledge] = useState<Knowledge[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<'brand' | 'faq' | 'knowledge' | null>(null)
  const [brandEditor, setBrandEditor] = useState<Brand | 'new' | null>(null)
  const [constraintBrand, setConstraintBrand] = useState<Brand | null>(null)
  const [faqEditor, setFaqEditor] = useState<Faq | 'new' | null>(null)

  const load = useCallback(async () => {
    try {
      const [dashboard, brandRows, faqRows, knowledgeRows, logRows] = await Promise.all([api<Stats>('/dashboard'), api<Brand[]>('/brands'), api<Faq[]>('/faqs'), api<Knowledge[]>('/knowledge'), api<Log[]>('/logs')])
      setStats(dashboard); setBrands(brandRows); setFaqs(faqRows); setKnowledge(knowledgeRows); setLogs(logRows)
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法连接服务') }
  }, [])
  useEffect(() => { void load() }, [load])
  const done = async (message: string) => { await load(); setModal(null); setNotice(message) }
  const remove = async (endpoint: string) => { if (!window.confirm('确定删除该条记录？')) return; await api(endpoint, { method: 'DELETE' }); await done('已删除') }

  return <div className="shell">
    <header className="topbar"><div className="brand-mark">G</div><div className="product-name"><strong>GEO 智能优化引擎</strong><span>Generative Engine Optimization</span></div><div className="platform-strip">Reddit · 头条 · 知乎 · 搜狐 · 网易 · 百家 · 公众号</div><div className="status"><i /> v2.3 · 运行中</div></header>
    <aside className="sidebar"><p className="sidebar-label">功能导航</p><nav>{nav.map(([id, title, description, Icon], index) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><span className="nav-number">{String(index + 1).padStart(2, '0')}</span><Icon size={16} /><span><b>{title}</b><small>{description}</small></span></button>)}</nav><div className="sidebar-divider"/><p className="sidebar-label">系统信息</p><dl className="system-info"><div><dt>平台数</dt><dd>{stats.platform_count}</dd></div><div><dt>品牌数</dt><dd>{stats.brand_count}</dd></div><div><dt>FAQ 数</dt><dd>{stats.faq_count}</dd></div><div><dt>知识条目</dt><dd>{stats.knowledge_count}</dd></div><div><dt>运行状态</dt><dd className="online"><i />在线</dd></div></dl></aside>
    <main className="workspace">
      {notice && <div className="notice">{notice}<button title="关闭提示" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {page === 'geo' && <GeoPage onDone={message => { setNotice(message); void load() }} />}
      {page === 'brands' && <BrandPage brands={brands} onCreate={() => setBrandEditor('new')} onEdit={setBrandEditor} onConstraint={setConstraintBrand} onDelete={brand => void remove(`/brands/${brand.id}`)} />}
      {page === 'faqs' && <FaqPage faqs={faqs} onCreate={() => setFaqEditor('new')} onEdit={setFaqEditor} onDelete={faq => void remove(`/faqs/${faq.id}`)} />}
      {page === 'knowledge' && <><PageHeader code="KB" title="知识库" description="维护企业素材"><button className="primary" onClick={() => setModal('knowledge')}><Plus size={16} />新增知识</button></PageHeader><ResourceTable columns={['知识名称', '类型', '内容摘要']} wide rows={knowledge.map(item => [item.name, item.category, item.content])} onDelete={index => void remove(`/knowledge/${knowledge[index].id}`)} /></>}
      {page === 'compose' && <ComposePage brands={brands} faqCount={stats.faq_count} knowledgeCount={stats.knowledge_count} onDone={message => { setNotice(message); void load() }} />}
      {page === 'logs' && <LogsPage logs={logs} onClear={async () => { if (!window.confirm('确定清空所有日志？此操作不可恢复。')) return; await api('/logs', { method: 'DELETE' }); await done('日志已清空') }} />}
    </main>
    {brandEditor && <BrandForm brand={brandEditor === 'new' ? null : brandEditor} onClose={() => setBrandEditor(null)} onSave={async value => { const endpoint = brandEditor === 'new' ? '/brands' : `/brands/${brandEditor.id}`; await api(endpoint, { method: brandEditor === 'new' ? 'POST' : 'PUT', body: JSON.stringify(value) }); await load(); setBrandEditor(null); setNotice(brandEditor === 'new' ? '品牌已创建' : '品牌已更新') }} />}
    {constraintBrand && <ConstraintForm brand={constraintBrand} onClose={() => setConstraintBrand(null)} onSave={async constraint => { await api(`/brands/${constraintBrand.id}/constraint`, { method: 'PUT', body: JSON.stringify({ constraint }) }); await load(); setConstraintBrand(null); setNotice('全局约束已保存') }} />}
    {faqEditor && <FaqForm faq={faqEditor === 'new' ? null : faqEditor} onClose={() => setFaqEditor(null)} onSave={async value => { try { const endpoint = faqEditor === 'new' ? '/faqs' : `/faqs/${faqEditor.id}`; await api(endpoint, { method: faqEditor === 'new' ? 'POST' : 'PUT', body: JSON.stringify(value) }); await load(); setFaqEditor(null); setNotice(faqEditor === 'new' ? 'FAQ 已创建' : 'FAQ 已更新') } catch (error) { setNotice(error instanceof Error ? error.message : 'FAQ 保存失败') } }} />}
    {modal === 'knowledge' && <KnowledgeForm onClose={() => setModal(null)} onSave={async value => { await api('/knowledge', { method: 'POST', body: JSON.stringify(value) }); await done('知识条目已创建') }} />}
  </div>
}

function BrandPage({ brands, onCreate, onEdit, onConstraint, onDelete }: { brands: Brand[]; onCreate: () => void; onEdit: (brand: Brand) => void; onConstraint: (brand: Brand) => void; onDelete: (brand: Brand) => void }) {
  return <><PageHeader code="BRAND" title="品牌管理" description="维护品牌基础资料与约束"><button className="primary" onClick={onCreate}><Plus size={16} />新增品牌</button></PageHeader><section className="panel table-panel"><div className="table-scroll"><table className="brand-table"><thead><tr><th>品牌 ID</th><th>品牌名称</th><th>公司主体</th><th>别名/英文名</th><th>成立时间</th><th>总部/地区</th><th>产品体系</th><th>目标客户</th><th>核心能力</th><th>操作</th></tr></thead><tbody>{brands.map(brand => <tr key={brand.id}><td><span className="id-badge">{brand.brand_code}</span></td><td className="strong">{brand.name}</td><td>{brand.company}</td><td>{brand.alias || '-'}</td><td>{brand.founded || '-'}</td><td>{brand.region || '-'}</td><td>{brand.products || '-'}</td><td>{brand.target_customers || '-'}</td><td>{brand.core_capability || '-'}</td><td><div className="action-row"><button className="text-action" onClick={() => onEdit(brand)}><Pencil size={13}/>编辑</button><button className="constraint-action" onClick={() => onConstraint(brand)}>约束配置</button><button className="delete-action" onClick={() => onDelete(brand)}>删除</button></div></td></tr>)}</tbody></table></div></section></>
}

function FaqPage({ faqs, onCreate, onEdit, onDelete }: { faqs: Faq[]; onCreate: () => void; onEdit: (faq: Faq) => void; onDelete: (faq: Faq) => void }) {
  return <>
    <PageHeader code="FAQ" title="FAQ 管理 / 常见问题问答" description="维护面向运营与内容生成的标准问答">
      <button className="primary" onClick={onCreate}><Plus size={16} />新增 FAQ</button>
    </PageHeader>
    <section className="panel table-panel faq-panel">
      <div className="faq-panel-head"><h2>常见问题列表</h2><span>共 {faqs.length} 条</span></div>
      <div className="table-scroll"><table className="faq-table"><thead><tr><th>类型</th><th>问题</th><th>答案</th><th>操作</th></tr></thead><tbody>
        {faqs.length ? faqs.map(faq => <tr key={faq.id}>
          <td><span className={`faq-category-tag ${faqCategoryClass(faq.category)}`}>{faq.category}</span></td>
          <td><div className="faq-question"><strong>{faq.question}</strong></div></td>
          <td><p className="faq-answer">{faq.answer}</p></td>
          <td><div className="action-row"><button className="text-action" onClick={() => onEdit(faq)}><Pencil size={13} />编辑</button><button className="delete-action" onClick={() => onDelete(faq)}>删除</button></div></td>
        </tr>) : <tr><td colSpan={4} className="empty">暂无 FAQ，点击右上角新增 FAQ。</td></tr>}
      </tbody></table></div>
    </section>
  </>
}

function faqCategoryClass(category: string) {
  return ({ '采购流程': 'procurement', '产品描述与认证': 'product', '价格与起订量': 'pricing', '售后与质保': 'support' } as Record<string, string>)[category] || 'product'
}

function ResourceTable({ columns, rows, onDelete, wide }: { columns: string[]; rows: string[][]; onDelete: (index: number) => void; wide?: boolean }) {
  return <section className="panel table-panel"><div className="table-scroll"><table className={wide ? 'wide' : ''}><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}<th>操作</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex === 0 ? 'strong' : ''}>{cell}</td>)}<td><button className="danger-button" aria-label={`删除${row[0]}`} title="删除" onClick={() => onDelete(index)}><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan={columns.length + 1} className="empty">暂无记录</td></tr>}</tbody></table></div></section>
}

function GeoPage({ onDone }: { onDone: (message: string) => void }) {
  const [keyword, setKeyword] = useState('海云端')
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [reports, setReports] = useState<GeoReport[]>([])
  const [result, setResult] = useState<GeoResult | null>(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [editingReport, setEditingReport] = useState(false)
  const [reportKeyword, setReportKeyword] = useState('')
  const [reportSummaries, setReportSummaries] = useState<Record<string, string>>({})
  const [editingProvider, setEditingProvider] = useState<ModelProvider | 'new' | null>(null)
  const [loading, setLoading] = useState(false)
  const loadProviders = useCallback(async () => { const data = await api<ModelProvider[]>('/model-providers'); setProviders(data.filter(item => ['qwen', 'hunyuan', 'volcengine', 'tencent_search'].includes(item.provider_type))) }, [])
  const loadReports = useCallback(async () => { setReports(await api<GeoReport[]>('/geo/reports')) }, [])
  useEffect(() => { void Promise.all([loadProviders(), loadReports()]) }, [loadProviders, loadReports])
  const usesLegacyHunyuanAuth = (provider: ModelProvider) => provider.provider_type === 'hunyuan' && !provider.base_url.includes('tencentmaas.com')
  const isConfigured = (provider: ModelProvider) => provider.has_api_key && (!usesLegacyHunyuanAuth(provider) || provider.has_api_secret) && (provider.provider_type !== 'tencent_search' || provider.has_aux_api_key)
  const enabledProviders = providers.filter(provider => provider.enabled && isConfigured(provider))
  const toggleProvider = async (provider: ModelProvider) => {
    if (!isConfigured(provider) && !provider.enabled) { setEditingProvider(provider); return }
    try {
      await api(`/model-providers/${provider.id}`, { method: 'PUT', body: JSON.stringify({ name: provider.name, base_url: provider.base_url, model: provider.model, provider_type: provider.provider_type, protocol: provider.protocol, api_key: '', api_secret: '', aux_api_key: '', enabled: !provider.enabled }) })
      await loadProviders()
    } catch (error) { onDone(error instanceof Error ? error.message : '模型状态更新失败') }
  }
  const deleteProvider = async (provider: ModelProvider) => {
    if (!window.confirm(`确定删除模型通道“${provider.name}”？`)) return
    await api(`/model-providers/${provider.id}`, { method: 'DELETE' })
    await loadProviders()
    setResult(null)
    onDone('模型通道已删除')
  }
  const evaluate = async () => {
    if (!enabledProviders.length) return
    setLoading(true)
    try {
      setResult(null)
      const data = await api<GeoResult>('/geo/evaluate', { method: 'POST', body: JSON.stringify({ keyword, provider_ids: enabledProviders.map(provider => provider.id) }) })
      setResult(data); setActiveTab('summary'); setEditingReport(false); await loadReports(); onDone(`评估已完成，报告 ${data.report.report_code} 已保存`)
    } catch (error) { onDone(error instanceof Error ? error.message : '评估失败') } finally { setLoading(false) }
  }
  const openReport = async (reportId: number) => {
    try {
      setResult(await api<GeoResult>(`/geo/reports/${reportId}`)); setActiveTab('summary'); setEditingReport(false)
    } catch (error) { onDone(error instanceof Error ? error.message : '报告读取失败') }
  }
  const deleteReport = async (report: GeoReport) => {
    if (!window.confirm(`确定删除报告“${report.keyword}”？此操作不可恢复。`)) return
    try {
      await api(`/geo/reports/${report.id}`, { method: 'DELETE' })
      if (result?.report.id === report.id) setResult(null)
      await loadReports()
      onDone('评估报告已删除')
    } catch (error) { onDone(error instanceof Error ? error.message : '报告删除失败') }
  }
  const startReportEdit = () => {
    if (!result) return
    setReportKeyword(result.keyword)
    setReportSummaries(Object.fromEntries(result.platforms.map(platform => [platform, result.results[platform]?.summary || ''])))
    setEditingReport(true)
  }
  const saveReport = async () => {
    if (!result || !reportKeyword.trim()) return
    try {
      const saved = await api<GeoResult>(`/geo/reports/${result.report.id}`, { method: 'PUT', body: JSON.stringify({ keyword: reportKeyword, summaries: reportSummaries }) })
      setResult(saved); setEditingReport(false); await loadReports(); onDone(`报告 ${saved.report.report_code} 已保存`)
    } catch (error) { onDone(error instanceof Error ? error.message : '报告保存失败') }
  }
  const current = activeTab === 'summary' ? null : result?.results[activeTab]
  const aggregate = result?.aggregate
  return <>{result && Object.keys(result.failures ?? {}).length > 0 && <section className="panel provider-failure-panel"><h2>未完成的模型</h2>{Object.entries(result.failures ?? {}).map(([name, failure]) => <p key={name}><strong>{name} · {failure.model}</strong><span>{failure.error}</span></p>)}</section>}
    <PageHeader code="SEARCH" title="GEO 结果查询" description="调用已启用模型的原生联网能力，汇总可验证引用信源"><button className="secondary" onClick={() => setEditingProvider('new')}><Plus size={15}/>新增模型</button></PageHeader>
    <section className="panel geo-control-panel">
      <div className="geo-query-row"><label>品牌词 / 关键词<input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="输入品牌词或关键词" /></label><button className="primary geo-evaluate" disabled={!keyword.trim() || !enabledProviders.length || loading} onClick={() => void evaluate()}><Search size={16} />{loading ? '评估中' : '开始评估'}</button></div>
      <div className="model-channel-head"><div><strong>模型通道</strong><span>只有已启用且凭证完整的模型会参与评估</span></div><span>{enabledProviders.length} 个已启用</span></div>
      <div className="model-channel-list">{providers.map(provider => { const configured = isConfigured(provider); return <article className={`model-channel-row ${provider.enabled && configured ? 'active' : ''}`} key={provider.id}><button className={`channel-toggle ${provider.enabled && configured ? 'on' : ''}`} role="switch" aria-checked={provider.enabled && configured} title={configured ? (provider.enabled ? '停用模型' : '先完成模型配置') : '先完成模型配置'} onClick={() => void toggleProvider(provider)}><span /></button><div className="channel-mark">{provider.provider_type === 'qwen' ? 'Q' : provider.provider_type === 'hunyuan' ? 'H' : provider.provider_type === 'tencent_search' ? 'T' : 'D'}</div><div className="channel-copy"><strong>{provider.name}</strong><span>{provider.model === '待填写' ? '未填写模型名称' : provider.model} · {configured ? (provider.enabled ? '已启用' : '已停用') : provider.provider_type === 'tencent_search' ? '待配置 SecretId / SecretKey / TokenHub Key' : usesLegacyHunyuanAuth(provider) ? '待配置 SecretId / SecretKey' : '待配置 API Key'}</span></div><div className="channel-actions"><button className="icon-button" title="编辑模型" onClick={() => setEditingProvider(provider)}><Pencil size={15}/></button><button className="icon-button danger-icon" title="删除模型" onClick={() => void deleteProvider(provider)}><Trash2 size={15}/></button></div></article> })}{!providers.length && <div className="channel-empty">暂无模型通道</div>}</div>
    </section>
    {!!reports.length && <section className="panel report-history"><div className="report-history-head"><div><strong>最近评估报告</strong><span>评估完成后自动保存，可在线查看、下载或删除</span></div><span>{reports.length} 份</span></div><div className="report-history-list">{reports.slice(0, 5).map(report => <article key={report.id} className={result?.report.id === report.id ? 'current' : ''}><button className="report-open" onClick={() => void openReport(report.id)}><FileText size={16}/><span><strong>{report.keyword}</strong><small>{report.report_code} · {report.provider_names.length} 个模型 · {new Date(report.created_at).toLocaleString('zh-CN', { hour12: false })}</small></span></button><div className="report-row-actions"><button className="report-view-action" title="在线查看报告" onClick={() => void openReport(report.id)}><Eye size={14}/>查看</button><a href={`/api/geo/reports/${report.id}/download.docx`} title="下载 Word 报告"><Download size={14}/>Word</a><a href={`/api/geo/reports/${report.id}/download.pdf`} title="下载 PDF 报告"><Download size={14}/>PDF</a><button className="report-delete-action" title="删除报告" onClick={() => void deleteReport(report)}><Trash2 size={14}/></button></div></article>)}</div></section>}
    {result && <><div className="metric-grid"><Metric label="参与模型" value={String(result.platforms.length)}/><Metric label="确认正文引用" value={String(aggregate?.total_confirmed_mentions ?? 0)}/><Metric label="来源记录" value={String(aggregate?.total_source_records ?? result.page_count)}/><Metric label="高频网站" value={String(aggregate?.domain_count ?? 0)} warn/></div><div className="result-bar"><div className="result-tabs"><button className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>汇总</button>{result.platforms.map(platform => <button key={platform} className={activeTab === platform ? 'active' : ''} onClick={() => setActiveTab(platform)}>{platform}</button>)}</div><div className="report-downloads"><button className="report-view-action" title="编辑报告" onClick={startReportEdit}><Pencil size={14}/>编辑</button><span><CheckCircle2 size={14}/>{result.report.report_code} 已保存</span><a href={`/api/geo/reports/${result.report.id}/download.docx`} title="下载 Word 报告"><Download size={14}/>Word</a><a href={`/api/geo/reports/${result.report.id}/download.pdf`} title="下载 PDF 报告"><Download size={14}/>PDF</a></div></div>{editingReport && <section className="panel report-editor"><div className="report-editor-head"><div><h2>编辑评估报告</h2><p>保存后，在线查看、Word 和 PDF 下载都会使用修改后的内容。</p></div><button className="icon-button" title="关闭编辑" onClick={() => setEditingReport(false)}><X size={16}/></button></div><label>关键词<input value={reportKeyword} onChange={event => setReportKeyword(event.target.value)}/></label>{result.platforms.map(platform => <label key={platform}>{platform} · 模型回答<textarea rows={12} value={reportSummaries[platform] ?? ''} onChange={event => setReportSummaries(previous => ({ ...previous, [platform]: event.target.value }))}/></label>)}<div className="form-actions"><button className="secondary" onClick={() => setEditingReport(false)}>取消</button><button className="primary" onClick={() => void saveReport()}>保存报告</button></div></section>}{activeTab === 'summary' ? <section className="panel result-panel summary-result"><h2>高频引用网站排行 <span className="count-badge">{aggregate?.domain_count ?? 0} 个网站</span></h2><p className="ai-summary">已启用的 {result.platforms.join('、')} 完成联网评估。排名优先依据确认的正文引用次数，其次是模型覆盖和来源记录数，用于识别更值得投放文章或视频的网站；同一页面在多个模型中出现会累计统计。</p><div className="table-scroll"><table className="aggregate-domains"><thead><tr><th>网站 / 域名</th><th>确认正文引用</th><th>模型覆盖</th><th>来源记录</th><th>页面数</th><th>参与模型</th></tr></thead><tbody>{aggregate?.domains.map(row => <tr key={row.domain}><td><strong>{row.site_name || row.domain}</strong><br/><small>{row.domain}</small></td><td className="blue-value">{row.confirmed_mentions}</td><td>{row.model_count} 个模型</td><td>{row.source_records}</td><td>{row.page_count}</td><td>{row.models.map(model => model.name).join('、')}</td></tr>)}</tbody></table></div><h2>跨模型页面累计明细 <span className="count-badge">{aggregate?.page_count ?? 0} 个页面</span></h2><div className="table-scroll"><table className="aggregate-pages"><thead><tr><th>页面标题</th><th>站点</th><th>确认正文引用</th><th>模型覆盖</th><th>来源记录</th><th>完整 URL</th><th>日期</th></tr></thead><tbody>{aggregate?.pages.map(row => <tr key={row.url}><td><a className="page-link" href={row.url} target="_blank" rel="noreferrer">{row.title}</a></td><td>{row.site_name || row.domain}</td><td className="blue-value">{row.confirmed_mentions}</td><td>{row.model_count} 个模型</td><td>{row.source_records}</td><td><a className="source-url" href={row.url} target="_blank" rel="noreferrer">{row.url}</a></td><td>{row.date}</td></tr>)}</tbody></table></div></section> : current && <section className="panel result-panel"><h2>模型回答 <span className="model-badge">{current.model}</span></h2><MarkdownAnswer content={current.summary}/><div className="result-stack"><div><h2>引用域名列表 <span className="count-badge">{current.domains.length} 个域名</span></h2><div className="table-scroll"><table><thead><tr><th>域名</th><th>正文引用次数</th><th>引用占比</th></tr></thead><tbody>{current.domains.map(row => <tr key={row.domain}><td>{row.domain}</td><td>{formatMentions(row.mentions)}</td><td className="blue-value">{row.share}</td></tr>)}</tbody></table></div></div><div><h2>引用页面列表 <span className="count-badge">{current.pages.length} 个页面</span></h2><div className="table-scroll"><table><thead><tr><th>页面标题</th><th>站点</th><th>完整 URL</th><th>正文引用次数</th><th>日期</th></tr></thead><tbody>{current.pages.map(row => <tr key={row.url}><td><a className="page-link" href={row.url} target="_blank" rel="noreferrer" title={row.snippet}>{row.title}</a></td><td>{row.site_name || row.domain}</td><td><a className="source-url" href={row.url} target="_blank" rel="noreferrer">{row.url}</a></td><td className="blue-value">{formatMentions(row.mentions)}</td><td>{row.date}</td></tr>)}</tbody></table></div></div></div></section>}</>}
    {editingProvider && <ProviderEditor provider={editingProvider} onClose={() => setEditingProvider(null)} onSaved={async () => { setEditingProvider(null); await loadProviders(); onDone('模型通道已保存') }}/>} 
  </>
}

const PROVIDER_DEFAULTS: Record<ProviderType, { name: string; base_url: string; protocol: ModelProvider['protocol'] }> = {
  qwen: { name: 'Qwen / 阿里百炼', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', protocol: 'chat_completions' },
  hunyuan: { name: '腾讯混元 / TokenHub', base_url: 'https://tokenhub-intl.tencentmaas.com/v1', protocol: 'chat_completions' },
  volcengine: { name: '火山方舟 / 豆包', base_url: 'https://ark.cn-beijing.volces.com/api/v3', protocol: 'responses' },
  tencent_search: { name: '腾讯联网搜索 + 混元摘要', base_url: 'https://wsa.tencentcloudapi.com', protocol: 'chat_completions' },
}

function ProviderEditor({ provider, onClose, onSaved }: { provider: ModelProvider | 'new'; onClose: () => void; onSaved: () => Promise<void> }) {
  const existing = provider === 'new' ? null : provider
  const initialType: ProviderType = existing?.provider_type || 'qwen'
  const defaults = PROVIDER_DEFAULTS[initialType]
  const [form, setForm] = useState({ provider_type: initialType, name: existing?.name || defaults.name, base_url: existing?.base_url || defaults.base_url, model: existing?.model === '待填写' ? '' : existing?.model || '', protocol: existing?.protocol || defaults.protocol, api_key: '', api_secret: '', aux_api_key: '', enabled: existing?.enabled ?? true })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!existing) return
    void api<{ api_key: string; api_secret: string; aux_api_key: string }>(`/model-providers/${existing.id}/credentials`)
      .then(credentials => setForm(current => ({ ...current, api_key: credentials.api_key, api_secret: credentials.api_secret, aux_api_key: credentials.aux_api_key })))
      .catch(reason => setError(reason instanceof Error ? reason.message : '凭证读取失败'))
  }, [existing])
  const selectProviderType = (providerType: ProviderType) => {
    const next = PROVIDER_DEFAULTS[providerType]
    setForm(current => ({ ...current, provider_type: providerType, name: next.name, base_url: next.base_url, protocol: next.protocol }))
  }
  const save = async () => {
    const usesLegacyHunyuanAuth = form.provider_type === 'hunyuan' && !form.base_url.includes('tencentmaas.com')
    const usesTencentSearch = form.provider_type === 'tencent_search'
    const missingApiKey = !form.api_key && !existing?.has_api_key
    const missingHunyuanSecret = usesLegacyHunyuanAuth && !form.api_secret && !existing?.has_api_secret
    const missingTencentSearchCredentials = usesTencentSearch && ((!form.api_secret && !existing?.has_api_secret) || (!form.aux_api_key && !existing?.has_aux_api_key))
    if (!form.name || !form.base_url || !form.model || missingApiKey || missingHunyuanSecret || missingTencentSearchCredentials) { setError(usesTencentSearch ? '请填写 SecretId、SecretKey 和 TokenHub API Key。' : usesLegacyHunyuanAuth ? '旧版腾讯云接口需填写 SecretId 和 SecretKey；TokenHub 只需 API Key。' : '请填写通道名称、Base URL、模型名称和 API Key。'); return }
    try {
      await api(existing ? `/model-providers/${existing.id}` : '/model-providers', { method: existing ? 'PUT' : 'POST', body: JSON.stringify(form) })
      await onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败') }
  }
  const usesLegacyHunyuanAuth = form.provider_type === 'hunyuan' && !form.base_url.includes('tencentmaas.com')
  const usesTencentSearch = form.provider_type === 'tencent_search'
  return <Modal title={existing ? `编辑模型通道 · ${existing.name}` : '新增原生联网模型通道'} onClose={onClose}><div className="form-fields"><label>模型厂商<select value={form.provider_type} onChange={event => selectProviderType(event.target.value as ProviderType)}><option value="qwen">Qwen / 阿里百炼</option><option value="hunyuan">腾讯混元 / TokenHub</option><option value="volcengine">火山方舟 / 豆包</option><option value="tencent_search">腾讯联网搜索 + 混元摘要</option></select></label><label>通道名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>Base URL<input value={form.base_url} onChange={event => setForm({ ...form, base_url: event.target.value })}/></label><label>模型名称<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder={form.provider_type === 'hunyuan' ? '例如：hy3 或 hy3-preview' : usesTencentSearch ? '填写 TokenHub 模型，例如 hy3' : '填写厂商模型名称'}/></label><label>接口协议<select value={form.protocol} onChange={event => setForm({ ...form, protocol: event.target.value as ModelProvider['protocol'] })} disabled={usesLegacyHunyuanAuth || usesTencentSearch}><option value="responses">Responses API</option><option value="chat_completions">Chat Completions API</option></select></label><label>{usesLegacyHunyuanAuth || usesTencentSearch ? 'SecretId' : 'API Key'}<input type="text" value={form.api_key} onChange={event => setForm({ ...form, api_key: event.target.value })} placeholder={`输入${usesLegacyHunyuanAuth || usesTencentSearch ? ' SecretId' : ' API Key'}`}/></label>{(usesLegacyHunyuanAuth || usesTencentSearch) && <label>SecretKey<input type="text" value={form.api_secret} onChange={event => setForm({ ...form, api_secret: event.target.value })} placeholder="输入 SecretKey"/></label>}{usesTencentSearch && <label>TokenHub API Key<input type="text" value={form.aux_api_key} onChange={event => setForm({ ...form, aux_api_key: event.target.value })} placeholder="输入用于 hy3 摘要的 TokenHub API Key"/></label>}{usesTencentSearch && <p className="credential-note">先由腾讯 SearchPro 返回结构化网页信源，再由 TokenHub 模型仅依据这些资料生成带 [序号] 引用的 Markdown 回答。</p>}<label className="check-label"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })}/>启用此通道</label>{error && <p className="form-error">{error}</p>}</div><footer className="form-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={() => void save()}>保存配置</button></footer></Modal>
}

function MarkdownAnswer({ content }: { content: string }) {
  return <div className="markdown-answer"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href?.startsWith('http://') || href?.startsWith('https://') ? href : undefined} target="_blank" rel="noreferrer">{children}</a> }}>{content}</ReactMarkdown></div>
}

function formatMentions(value: number | null) { return value == null ? '未提供' : `${value} 次` }

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) { return <section className={`metric ${warn ? 'warn' : ''}`}><span>{label}</span><strong>{value}</strong></section> }
function ComposePage({ brands, faqCount, knowledgeCount, onDone }: { brands: Brand[]; faqCount: number; knowledgeCount: number; onDone: (message: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [supplement, setSupplement] = useState('')
  const [optimizationPrompt, setOptimizationPrompt] = useState('')
  const [includeFaq, setIncludeFaq] = useState(true)
  const [includeKnowledge, setIncludeKnowledge] = useState(true)
  const [brandId, setBrandId] = useState<number>(brands[0]?.id || 0)
  const [current, setCurrent] = useState<Article | null>(null)
  const [historyArticle, setHistoryArticle] = useState<Article | null>(null)
  const [history, setHistory] = useState<Article[]>([])
  const [imageVersion, setImageVersion] = useState(0)
  const [mediaProviders, setMediaProviders] = useState<MediaProvider[]>([])
  const [mediaEditor, setMediaEditor] = useState<MediaProvider | 'new' | null>(null)
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [mediaBusy, setMediaBusy] = useState(false)
  const [imageStatus, setImageStatus] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoStatus, setVideoStatus] = useState('')
  const [generating, setGenerating] = useState(false)
  const [languages, setLanguages] = useState<Record<number, TranslationTask['language']>>({})
  const [tasks, setTasks] = useState<Record<number, TranslationTask>>({})

  const loadHistory = useCallback(async () => setHistory(await api<Article[]>('/articles')), [])
  const loadTasks = useCallback(async () => {
    const rows = await api<TranslationTask[]>('/translation-tasks')
    setTasks(Object.fromEntries(rows.map(task => [task.article_id, task])))
  }, [])
  const loadMediaProviders = useCallback(async () => setMediaProviders(await api<MediaProvider[]>('/media-providers')), [])
  useEffect(() => { void loadHistory(); void loadTasks(); void loadMediaProviders() }, [loadHistory, loadTasks, loadMediaProviders])
  useEffect(() => { if (!brandId && brands[0]) setBrandId(brands[0].id) }, [brandId, brands])
  useEffect(() => {
    const active = Object.values(tasks).filter(task => task.status === 'processing')
    if (!active.length) return
    const timer = window.setInterval(() => {
      active.forEach(task => {
        void api<TranslationTask>(`/translation-tasks/${task.id}`).then(updated => {
          setTasks(previous => ({ ...previous, [updated.article_id]: updated }))
          if (updated.status === 'completed') onDone(`${updated.language} 图文版本已完成`)
        }).catch(error => {
          const message = error instanceof Error ? error.message : '翻译任务失败'
          setTasks(previous => ({ ...previous, [task.article_id]: { ...task, status: 'failed', error: message } }))
        })
      })
    }, 900)
    return () => window.clearInterval(timer)
  }, [tasks, onDone])

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      const article = await api<Article>('/compose', { method: 'POST', body: JSON.stringify({ prompt, supplemental_prompt: supplement, brand_id: brandId || null, include_faq: includeFaq, include_knowledge: includeKnowledge }) })
      setCurrent(article); setImageVersion(0); await loadHistory(); onDone(`${article.article_code} 已生成`)
    } finally { setGenerating(false) }
  }
  const toggleMediaProvider = async (provider: MediaProvider) => {
    if (!provider.has_api_key && !provider.enabled) { setMediaEditor(provider); return }
    try {
      await api(`/media-providers/${provider.id}`, { method: 'PUT', body: JSON.stringify({ name: provider.name, media_type: provider.media_type, base_url: provider.base_url, model: provider.model, api_key: '', enabled: !provider.enabled }) })
      await loadMediaProviders()
    } catch (error) { onDone(error instanceof Error ? error.message : '媒体模型状态更新失败') }
  }
  const deleteMediaProvider = async (provider: MediaProvider) => {
    if (!window.confirm(`确定删除媒体模型“${provider.name}”？`)) return
    await api(`/media-providers/${provider.id}`, { method: 'DELETE' }); await loadMediaProviders(); onDone('媒体模型已删除')
  }
  const updateCurrent = (patch: Partial<Article>) => setCurrent(previous => previous ? { ...previous, ...patch } : previous)
  const saveCopy = async () => {
    if (!current) return
    try { const saved = await api<Article>(`/articles/${current.id}`, { method: 'PUT', body: JSON.stringify({ content: current.content, image_prompt: current.image_prompt, selected_images: current.selected_images }) }); setCurrent(saved); await loadHistory(); onDone(`${saved.article_code} 文案已保存，现在可以生成配图`) } catch (error) { onDone(error instanceof Error ? error.message : '文案保存失败') }
  }
  const optimizeCopy = async () => {
    if (!current || !optimizationPrompt.trim()) { onDone('请输入优化提示词'); return }
    setGenerating(true)
    try { const optimized = await api<Article>(`/articles/${current.id}/optimize`, { method: 'POST', body: JSON.stringify({ instruction: optimizationPrompt }) }); setCurrent(optimized); setOptimizationPrompt(''); await loadHistory(); onDone('文案已按提示词优化，请确认后保存') } catch (error) { onDone(error instanceof Error ? error.message : '文案优化失败') } finally { setGenerating(false) }
  }
  const toggleImage = (imageId: string) => {
    if (!current) return
    const selected = current.selected_images.includes(imageId) ? current.selected_images.filter(id => id !== imageId) : current.selected_images.length < 3 ? [...current.selected_images, imageId] : current.selected_images
    if (selected === current.selected_images) { onDone('最多选择 3 张配图'); return }
    updateCurrent({ selected_images: selected })
  }
  const confirm = async () => {
    if (!current?.selected_images.length) { onDone('确认使用时至少保留 1 张选图'); return }
    const saved = await api<Article>(`/articles/${current.id}/confirm`, { method: 'POST', body: JSON.stringify({ content: current.content, image_prompt: current.image_prompt, selected_images: current.selected_images }) })
    setCurrent(saved); await loadHistory(); onDone(`${saved.article_code} 已确认使用`)
  }
  const startTranslation = async (article: Article) => {
    const language = languages[article.id] || 'English'
    try {
      const task = await api<TranslationTask>(`/articles/${article.id}/translations`, { method: 'POST', body: JSON.stringify({ language }) })
      setTasks(previous => ({ ...previous, [article.id]: task })); onDone(`正在生成 ${language} 图文版本`)
    } catch (error) { onDone(error instanceof Error ? error.message : '无法创建翻译任务') }
  }
  const retryTranslation = async (task: TranslationTask) => {
    const updated = await api<TranslationTask>(`/translation-tasks/${task.id}/retry`, { method: 'POST' })
    setTasks(previous => ({ ...previous, [task.article_id]: updated }))
  }
  const generateImages = async () => {
    if (!current) return
    const provider = mediaProviders.find(item => item.media_type === 'image' && item.enabled)
    if (!provider) { onDone('请先在媒体模型配置中启用并配置一个配图模型'); return }
    setMediaBusy(true)
    setImageStatus(`正在使用 ${provider.name} 生成配图…`)
    try {
      const response = await api<{ urls: string[] }>('/media/generate', { method: 'POST', body: JSON.stringify({ provider_id: provider.id, prompt: `${current.content}\n\n配图要求：${current.image_prompt || '专业、真实、适合商务内容发布的横版配图'}`.trim() }) })
      if (!response.urls.length) throw new Error('模型未返回可用图片')
      setGeneratedImages(response.urls.slice(0, 3)); updateCurrent({ selected_images: [] }); setImageStatus(`已生成 ${Math.min(response.urls.length, 3)} 张配图，请选择需要保留的图片`); onDone(`已使用 ${provider.name} 生成 ${Math.min(response.urls.length, 3)} 张配图`)
    } catch (error) { const message = error instanceof Error ? error.message : '配图生成失败'; setImageStatus(message); onDone(message) } finally { setMediaBusy(false) }
  }
  const generateVideo = async () => {
    if (!current) return
    const provider = mediaProviders.find(item => item.media_type === 'video' && item.enabled)
    if (!provider) { onDone('请先在媒体模型配置中启用并配置一个视频模型'); return }
    setMediaBusy(true)
    try {
      const response = await api<{ task_id?: string }>('/media/generate', { method: 'POST', body: JSON.stringify({ provider_id: provider.id, prompt: `${current.input_text}\n${current.image_prompt}`.trim() }) })
      if (!response.task_id) throw new Error('视频模型未返回任务编号')
      setVideoUrl(''); setVideoStatus('视频生成中')
      const poll = async () => {
        const task = await api<{ status: string; url?: string }>(`/media/tasks/${response.task_id}?provider_id=${provider.id}`)
        if (task.url) { setVideoUrl(task.url); setVideoStatus('视频已生成'); onDone('视频已生成') }
        else if (['failed', 'cancelled', 'canceled'].includes(task.status.toLowerCase())) { setVideoStatus('视频生成失败'); onDone('视频生成失败') }
        else window.setTimeout(() => void poll().catch(error => { setVideoStatus('视频任务查询失败'); onDone(error instanceof Error ? error.message : '视频任务查询失败') }), 5000)
      }
      void poll().catch(error => { setVideoStatus('视频任务查询失败'); onDone(error instanceof Error ? error.message : '视频任务查询失败') })
      onDone(`已使用 ${provider.name} 提交视频生成任务`)
    } catch (error) { onDone(error instanceof Error ? error.message : '视频生成失败') } finally { setMediaBusy(false) }
  }
  const downloadPackage = async (article: Article, task: TranslationTask) => {
    try {
      const response = await fetch(`/api/articles/${article.id}/download-package`)
      if (!response.ok) throw new Error('图文素材打包失败')
      downloadBlob(await response.blob(), `${article.article_code}-图文素材.zip`)
      await api('/logs/event', { method: 'POST', body: JSON.stringify({ category: '生成', action: '下载图文素材包', detail: `${article.article_code} · ${task.language} · ${article.selected_images.length} 张图片` }) })
      onDone(`已下载 ${article.article_code} 图文素材包`)
    } catch (error) { onDone(error instanceof Error ? error.message : '图文素材下载失败') }
  }
  const downloadArticle = (article: Article) => {
    const word = buildWordDocument(article, '中文', article.content)
    downloadBlob(new Blob([word], { type: 'application/msword;charset=utf-8' }), `${article.article_code}-文章.doc`)
    onDone(`${article.article_code} 已下载`)
  }
  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(`/api/media/download?url=${encodeURIComponent(url)}`)
      if (!response.ok) throw new Error('图片下载请求失败')
      downloadBlob(await response.blob(), filename)
    } catch {
      const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noreferrer'; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove()
    }
  }
  const downloadSelectedImages = async () => {
    if (!current?.selected_images.length) { onDone('请先选择至少一张配图'); return }
    current.selected_images.forEach((url, index) => window.setTimeout(() => void downloadImage(url, `${current.article_code}-配图-${index + 1}.jpg`), index * 180))
    onDone(`已开始下载 ${current.selected_images.length} 张配图`)
  }
  const deleteArticle = async (article: Article) => {
    if (!window.confirm(`确定删除 ${article.article_code}？`)) return
    try { await api(`/articles/${article.id}`, { method: 'DELETE' }); if (current?.id === article.id) setCurrent(null); await loadHistory(); onDone('文章历史已删除') } catch (error) { onDone(error instanceof Error ? error.message : '删除失败') }
  }
  const candidates = generatedImages.map(url => ({ id: url, src: url }))
  return <>
    <PageHeader code="AI" title="一键成文" description="从输入、素材到图文翻译与下载的完整生产工作台" />
    <div className="compose-input-grid">
      <section className="panel compose-copy-panel"><div className="section-head"><div><span>01</span><h2>输入文案</h2></div><small>明确主题、平台、语气与长度</small></div><label>输入文案<textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="输入原始文案、关键词或文章主题" /></label><label>补充提示词<textarea className="supplement-input" value={supplement} onChange={event => setSupplement(event.target.value)} placeholder="例如：面向采购负责人，语气专业，控制在 800 字以内" /></label></section>
      <section className="panel compose-source-panel"><div className="section-head"><div><span>02</span><h2>引用素材</h2></div><small>按当前数据实时读取</small></div><label className="brand-select">品牌口径<select value={brandId} onChange={event => setBrandId(Number(event.target.value))}>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name} · {brand.brand_code}</option>)}</select></label><div className="source-options"><button className={includeFaq ? 'selected' : ''} onClick={() => setIncludeFaq(value => !value)}><span>{includeFaq && <Check size={13} />}</span><div><b>FAQ 管理</b><small>{faqCount} 条标准问答</small></div></button><button className={includeKnowledge ? 'selected' : ''} onClick={() => setIncludeKnowledge(value => !value)}><span>{includeKnowledge && <Check size={13} />}</span><div><b>企业知识库</b><small>{knowledgeCount} 条企业素材</small></div></button></div><p className="constraint-note"><ShieldCheck size={14} />生成时自动注入所选品牌的全局约束</p><div className="model-channel-head media-channel-head"><div><strong>媒体模型</strong><span>仅已启用且凭据完整的模型会用于配图或视频</span></div><button className="icon-button" title="新增媒体模型" onClick={() => setMediaEditor('new')}><Plus size={15}/></button></div><div className="model-channel-list media-channel-list">{mediaProviders.map(provider => { const ready = provider.has_api_key; return <article className={`model-channel-row ${provider.enabled && ready ? 'active' : ''}`} key={provider.id}><button className={`channel-toggle ${provider.enabled && ready ? 'on' : ''}`} role="switch" aria-checked={provider.enabled && ready} title={ready ? (provider.enabled ? '停用模型' : '启用模型') : '请先完成模型配置'} onClick={() => void toggleMediaProvider(provider)}><span /></button><div className="channel-mark">{provider.media_type === 'image' ? '图' : '视'}</div><div className="channel-copy"><strong>{provider.name}</strong><span>{provider.model} · {provider.media_type === 'image' ? '配图' : '视频'} · {ready ? (provider.enabled ? '已启用' : '已停用') : '待配置 API Key'}</span></div><div className="channel-actions"><button className="icon-button" title="编辑媒体模型" onClick={() => setMediaEditor(provider)}><Pencil size={15}/></button><button className="icon-button danger-icon" title="删除媒体模型" onClick={() => void deleteMediaProvider(provider)}><Trash2 size={15}/></button></div></article> })}{!mediaProviders.length && <div className="channel-empty">暂无媒体模型，点击右侧加号新增。</div>}</div><button className="primary compose-generate" disabled={!prompt.trim() || generating} onClick={() => void generate()}><BrainCircuit size={16} />{generating ? '正在生成' : '一键生成'}</button></section>
    </div>
    {current && <section className="panel article-workbench"><div className="workbench-head"><div><span className="id-badge">{current.article_code}</span><div><h2>成品文章</h2><p>{current.content_saved_at ? '文案已保存，可继续生成配图或视频' : '可编辑文案；满意后保存，再进入配图流程'}</p></div></div><button className="primary" onClick={() => void saveCopy()}><CheckCircle2 size={15} />保存文案</button></div><div className={current.content_saved_at ? 'article-editor-grid' : 'article-copy-stage'}><div className="article-copy"><label>可编辑文案<textarea value={current.content} onChange={event => updateCurrent({ content: event.target.value, content_saved_at: null, confirmed_at: null })} /></label><div className="character-count">字数统计：<strong>{countCharacters(current.content)}</strong> 字</div><div className="image-toolbar"><label>优化提示词<input value={optimizationPrompt} onChange={event => setOptimizationPrompt(event.target.value)} placeholder="例如：改成更专业的采购指南，补充选购建议" /></label><button className="secondary" disabled={generating || !optimizationPrompt.trim()} onClick={() => void optimizeCopy()}><RefreshCw size={14} />{generating ? '优化中' : '继续优化'}</button></div></div>{!current.content_saved_at && <div className="article-preview"><header><span>格式预览</span><small>标题、段落、列表与表格将按 Markdown 排版</small></header><MarkdownAnswer content={current.content}/></div>}{current.content_saved_at && <div className="image-studio media-production"><div className="media-production-head"><div><span>媒体生产</span><strong>依据当前保存文案生成专业内容配图</strong></div></div><div className="image-toolbar"><label>生图补充提示词<input value={current.image_prompt} onChange={event => updateCurrent({ image_prompt: event.target.value })} placeholder="例如：工业场景、实拍质感、横版构图、不要文字" /></label><button className="primary" disabled={mediaBusy} onClick={() => void generateImages()}><Image size={14} />{mediaBusy ? '正在生成配图' : '生成专业配图'}</button><button className="secondary" disabled={mediaBusy} onClick={() => void generateVideo()}><RefreshCw size={14} />生成视频</button></div>{imageStatus && <p className="media-status">{imageStatus}</p>}{candidates.length ? <><div className="candidate-grid">{candidates.map((candidate, index) => <div className={`candidate-image ${current.selected_images.includes(candidate.id) ? 'selected' : ''}`} key={candidate.id}><button className="candidate-select" onClick={() => toggleImage(candidate.id)}><img src={candidate.src} alt={`候选配图 ${index + 1}`} /><span>{current.selected_images.includes(candidate.id) ? <><Check size={13} />已选择</> : `候选图 ${index + 1}`}</span></button><button className="image-download" title="下载图片" onClick={() => void downloadImage(candidate.src, `${current.article_code}-候选图-${index + 1}.jpg`)}><Download size={13}/>下载</button></div>)}</div><div className="media-actions"><button className="secondary" disabled={!current.selected_images.length} onClick={() => void downloadSelectedImages()}><Download size={14}/>下载已选配图</button>{current.selected_images.length > 0 && <button className="primary" onClick={() => void confirm()}><CheckCircle2 size={14} />保存图文成品</button>}</div></> : <div className="media-empty">点击“生成专业配图”后，候选图片会显示在这里。</div>}<p className="selection-note">已选择 {current.selected_images.length}/3 张；确认使用时至少保留 1 张。</p>{videoStatus && <div className="selection-note">{videoStatus}</div>}{videoUrl && <video controls className="generated-video" src={videoUrl} />}</div>}</div></section>}
    {mediaEditor && <MediaProviderEditor provider={mediaEditor} onClose={() => setMediaEditor(null)} onSaved={async () => { setMediaEditor(null); await loadMediaProviders(); onDone('媒体模型已保存') }} />}
    {historyArticle && <ArticleHistoryModal article={historyArticle} onClose={() => setHistoryArticle(null)} onSaved={async saved => { setHistoryArticle(null); if (current?.id === saved.id) setCurrent(saved); await loadHistory(); onDone(`${saved.article_code} 已保存`) }} />}
    <section className="panel history-panel"><div className="section-head history-heading"><div><span>03</span><h2>生成历史</h2></div><small>共 {history.length} 篇</small></div>{history.length ? <div className="history-list">{history.map(article => { const task = tasks[article.id]; const busy = task?.status === 'processing'; return <article className="history-row" key={article.id}><header><span className="id-badge">{article.article_code}</span><time><Clock3 size={12} />{formatTime(article.created_at)}</time><span className={`history-status ${article.content_saved_at ? 'confirmed' : ''}`}>{article.confirmed_at ? '图文已保存' : article.content_saved_at ? '文案已保存' : '待编辑'}</span><div className="channel-actions"><button className="icon-button" title="编辑文章" onClick={() => setHistoryArticle(article)}><Pencil size={15}/></button><button className="icon-button" title="下载文章" onClick={() => downloadArticle(article)}><Download size={15}/></button><button className="icon-button danger-icon" title="删除文章" onClick={() => void deleteArticle(article)}><Trash2 size={15}/></button></div></header><div className="history-content"><div><b>成品文案</b><p>{article.content}</p></div><div className="history-attachments"><b>图片附件</b><div>{article.selected_images.length ? article.selected_images.map(imageId => <img key={imageId} src={articleImageSource(article, imageId)} alt="已选配图" />) : <span>尚未确认选图</span>}</div></div></div><footer className="translation-control"><label><Languages size={14} />目标语言<select disabled={busy} value={languages[article.id] || 'English'} onChange={event => setLanguages(previous => ({ ...previous, [article.id]: event.target.value as TranslationTask['language'] }))}><option>English</option><option>Bahasa Indonesia</option><option>日语</option></select></label><button className="secondary" disabled={busy || !article.confirmed_at} onClick={() => void startTranslation(article)}>{busy ? '翻译进行中' : '开始翻译'}</button>{task && <div className={`translation-task ${task.status}`}><div><span>{task.status === 'completed' ? '已完成' : task.status === 'failed' ? '翻译失败' : `正在生成 ${task.language} 图文版本`}</span><strong>{task.progress}%</strong></div><div className="progress-track"><i style={{ width: `${task.progress}%` }} /></div>{task.status === 'failed' && <p>{task.error}<button onClick={() => void retryTranslation(task)}>重试</button></p>}</div>}<button className="primary" disabled={task?.status !== 'completed'} onClick={() => task && void downloadPackage(article, task)}><Download size={14} />一键下载</button></footer></article> })}</div> : <div className="history-empty"><FileText size={24} /><p>完成首次生成后，文章与翻译任务会显示在这里。</p></div>}</section>
  </>
}

function MediaProviderEditor({ provider, onClose, onSaved }: { provider: MediaProvider | 'new'; onClose: () => void; onSaved: () => Promise<void> }) {
  const existing = provider === 'new' ? null : provider
  const [form, setForm] = useState({ name: existing?.name || '', media_type: existing?.media_type || 'image' as 'image' | 'video', base_url: existing?.base_url || 'https://ark.cn-beijing.volces.com/api/v3', model: existing?.model || '', api_key: '', enabled: existing?.enabled ?? true })
  const [error, setError] = useState('')
  useEffect(() => { if (!existing) return; void api<{ api_key: string }>(`/media-providers/${existing.id}/credentials`).then(credentials => setForm(current => ({ ...current, api_key: credentials.api_key }))).catch(reason => setError(reason instanceof Error ? reason.message : '凭证读取失败')) }, [existing])
  const save = async () => {
    if (!form.name.trim() || !form.base_url.trim() || !form.model.trim() || (!form.api_key.trim() && !existing?.has_api_key)) { setError('请填写通道名称、Base URL、模型名称和 API Key。'); return }
    try { await api(existing ? `/media-providers/${existing.id}` : '/media-providers', { method: existing ? 'PUT' : 'POST', body: JSON.stringify(form) }); await onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败') }
  }
  return <Modal title={existing ? `编辑媒体模型 · ${existing.name}` : '新增媒体模型'} onClose={onClose}><div className="form-fields"><label>媒体用途<select value={form.media_type} onChange={event => setForm({ ...form, media_type: event.target.value as 'image' | 'video' })}><option value="image">配图模型</option><option value="video">视频模型</option></select></label><label>通道名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：豆包配图 · Seedream 5.0 Pro"/></label><label>Base URL<input value={form.base_url} onChange={event => setForm({ ...form, base_url: event.target.value })}/></label><label>模型名称<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder={form.media_type === 'image' ? '例如：Doubao-Seedream-5.0-pro' : '例如：Doubao-Seedance-2.5'}/></label><label>API Key<input type="text" value={form.api_key} onChange={event => setForm({ ...form, api_key: event.target.value })} placeholder="输入 API Key"/></label><label className="check-label"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })}/>启用此通道</label>{error && <p className="form-error">{error}</p>}</div><footer className="form-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={() => void save()}>保存配置</button></footer></Modal>
}

function ArticleHistoryModal({ article, onClose, onSaved }: { article: Article; onClose: () => void; onSaved: (article: Article) => Promise<void> }) {
  const [content, setContent] = useState(article.content)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try { const saved = await api<Article>(`/articles/${article.id}`, { method: 'PUT', body: JSON.stringify({ content, image_prompt: article.image_prompt, selected_images: article.selected_images }) }); await onSaved(saved) } finally { setSaving(false) }
  }
  return <Modal className="article-history-modal" title={`编辑文章 · ${article.article_code}`} onClose={onClose}><div className="form-fields"><label>文章内容<textarea className="history-article-editor" value={content} onChange={event => setContent(event.target.value)} /></label><footer className="form-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中' : '保存文章'}</button></footer></div></Modal>
}

function countCharacters(value: string) { return value.replace(/\s/g, '').length }
function articleImageSource(article: Article, imageId: string) { return /^https?:\/\//.test(imageId) || imageId.startsWith('data:') ? imageId : svgDataUrl(candidateSvg(article, imageId)) }
function escapeXml(value: string) { return value.replace(/[<>&'\"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] || char) }
function candidateSvg(article: Article, imageId: string) {
  const parts = imageId.split('-'); const version = Number(parts[1] || 0); const index = Number(parts[2] || 1) - 1
  const palettes = [['#e8f1ff', '#2563eb', '#173f7a'], ['#e8f6ef', '#27845a', '#174b37'], ['#fff2dc', '#c47a18', '#70440d']]
  const labels = ['主题封面', '核心信息', '行动引导']; const [background, accent, ink] = palettes[index % palettes.length]
  const title = escapeXml(article.input_text.slice(0, 25)); const hint = escapeXml(article.image_prompt || `版本 ${version + 1} · 运营配图`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="${background}"/><rect x="54" y="52" width="9" height="496" rx="4" fill="${accent}"/><circle cx="770" cy="145" r="92" fill="${accent}" opacity=".13"/><rect x="655" y="250" width="230" height="190" rx="8" fill="#fff" opacity=".8"/><path d="M690 392l54-65 46 44 48-83" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><text x="92" y="120" fill="${accent}" font-size="24" font-family="Arial, sans-serif" font-weight="700">${labels[index]}</text><text x="92" y="235" fill="${ink}" font-size="46" font-family="Arial, sans-serif" font-weight="700">${title}</text><text x="92" y="292" fill="${ink}" font-size="22" font-family="Arial, sans-serif" opacity=".68">${hint}</text><text x="92" y="510" fill="${accent}" font-size="20" font-family="Arial, sans-serif">${article.article_code}</text></svg>`
}
function svgDataUrl(svg: string) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }
function svgBase64(svg: string) { const bytes = new TextEncoder().encode(svg); let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte) }); return btoa(binary) }
function translatedArticle(article: Article, language: TranslationTask['language']) {
  if (language === 'English') return `Overview\n\nThis illustrated article was generated from the source brief: ${article.input_text}. It presents the key value, applicable scenarios, verifiable facts and recommended actions in a concise operational format.\n\nKey information\n\nThe content follows ${article.brand_name}'s global brand constraints. Product specifications, delivery commitments and service claims should be verified before publication.\n\nNext step\n\nReview the selected visuals and adapt the final call to action to the target publishing platform.`
  if (language === 'Bahasa Indonesia') return `Ringkasan\n\nArtikel bergambar ini dibuat berdasarkan arahan sumber: ${article.input_text}. Konten menjelaskan nilai utama, skenario penggunaan, fakta yang dapat diverifikasi, dan langkah tindakan dalam format yang ringkas.\n\nInformasi utama\n\nKonten mengikuti batasan merek global ${article.brand_name}. Spesifikasi produk, komitmen pengiriman, dan klaim layanan perlu diperiksa sebelum dipublikasikan.\n\nLangkah berikutnya\n\nTinjau gambar yang dipilih dan sesuaikan ajakan bertindak dengan platform publikasi tujuan.`
  return `概要\n\nこの記事は、次の入力内容をもとに生成された図文コンテンツです：${article.input_text}。主要な価値、利用場面、検証可能な事実、推奨アクションを簡潔に整理しています。\n\n主要情報\n\n本文は${article.brand_name}のブランド制約に基づいています。公開前に製品仕様、納期、サービス表現を確認してください。\n\n次のステップ\n\n選択した画像を確認し、配信先プラットフォームに合わせて行動喚起を調整してください。`
}
function buildWordDocument(article: Article, language: string, content: string) {
  const paragraphs = content.split(/\n+/).filter(Boolean); const selected = article.selected_images
  const body: string[] = []; paragraphs.forEach((paragraph, index) => { body.push(`<p>${escapeXml(paragraph)}</p>`); if (index === 0 && selected[0]) body.push(`<img src="data:image/svg+xml;base64,${svgBase64(candidateSvg(article, selected[0]))}"/>`); if (index === Math.max(1, Math.floor(paragraphs.length / 2)) && selected[1]) body.push(`<img src="data:image/svg+xml;base64,${svgBase64(candidateSvg(article, selected[1]))}"/>`) }); if (!paragraphs.length && selected[0]) body.push(`<img src="data:image/svg+xml;base64,${svgBase64(candidateSvg(article, selected[0]))}"/>`); if (paragraphs.length < 2 && selected[1]) body.push(`<img src="data:image/svg+xml;base64,${svgBase64(candidateSvg(article, selected[1]))}"/>`); if (selected[2]) body.push(`<img src="data:image/svg+xml;base64,${svgBase64(candidateSvg(article, selected[2]))}"/>`)
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#243044}h1{font-size:24px}p{font-size:12pt}img{display:block;width:560px;max-width:100%;margin:18px 0}.meta{color:#667085;font-size:10pt}</style></head><body><h1>${escapeXml(article.input_text)}</h1><p class="meta">文章编号：${article.article_code}　语言版本：${language}</p>${body.join('')}</body></html>`
}
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
function LogsPage({ logs, onClear }: { logs: Log[]; onClear: () => void }) { return <><PageHeader code="LOG" title="日志中心" description="操作日志与任务记录"><button className="weak-danger" onClick={onClear}><Trash2 size={16} />清空日志</button></PageHeader><section className="panel table-panel log-panel"><div className="log-panel-head"><h2>操作日志</h2><span>共 {logs.length} 条</span></div><div className="table-scroll"><table className="log-table"><thead><tr><th>时间</th><th>类型</th><th>操作</th><th>内容</th></tr></thead><tbody>{logs.length ? logs.map(item => <tr key={item.id}><td className="log-time">{formatTime(item.created_at)}</td><td><span className={`log-type type-${item.category}`}>{item.category}</span></td><td className="strong">{item.action}</td><td>{item.detail || '-'}</td></tr>) : <tr><td className="empty" colSpan={4}>暂无日志记录</td></tr>}</tbody></table></div></section></> }
function formatTime(value: string) { const date = new Date(value); const pad = (number: number) => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` }
const DEFAULT_CONSTRAINT = `1. 开头用金字塔原理写总体摘要，100-300 字，要有精华和干货
2. 重要结论有来源或可验证证据，体现品牌/主题，或有独立结论
3. 提供新的事实、数据、案例、方法或判断标准
4. 主打 2 个关键词，不要同时抢十几个互不相关的关键词
5. 适当介绍目标人群
6. 不要大量使用模糊代词
7. 不要标题党，要干货，要真诚`

function BrandForm({ brand, onClose, onSave }: { brand: Brand | null; onClose: () => void; onSave: (data: Omit<Brand, 'id' | 'brand_code'>) => void }) { const [value, setValue] = useState<Record<string, string>>({ name: brand?.name || '', company: brand?.company || '', alias: brand?.alias || '', founded: brand?.founded || '', region: brand?.region || '', products: brand?.products || '', target_customers: brand?.target_customers || '', core_capability: brand?.core_capability || '', certifications: brand?.certifications || '', constraint: brand?.constraint || DEFAULT_CONSTRAINT }); const fields: [string, string, boolean?][] = [['name', '品牌正式名称'], ['company', '公司主体 *'], ['alias', '品牌别名 / 英文名'], ['founded', '成立时间'], ['region', '总部 / 服务地区'], ['products', '产品体系'], ['target_customers', '目标客户'], ['core_capability', '核心能力 / 卖点'], ['certifications', '资质与认证', true]]; return <Modal title={brand ? `编辑品牌 · ${brand.brand_code}` : '新增品牌'} onClose={onClose}><FormFields value={value} setValue={setValue} fields={fields}/><FormActions onClose={onClose} onSave={() => onSave(value as Omit<Brand, 'id' | 'brand_code'>)} /></Modal> }
function ConstraintForm({ brand, onClose, onSave }: { brand: Brand; onClose: () => void; onSave: (constraint: string) => void }) { const [constraint, setConstraint] = useState(brand.constraint || DEFAULT_CONSTRAINT); return <Modal title={`全局约束配置 · ${brand.name}`} onClose={onClose}><div className="constraint-form"><label>约束提示词<textarea value={constraint} onChange={event => setConstraint(event.target.value)} /></label><p>此约束会在「一键成文」生成时自动注入，作为该品牌内容的基础规则。</p></div><FormActions onClose={onClose} onSave={() => onSave(constraint)} /></Modal> }
function FaqForm({ faq, onClose, onSave }: { faq: Faq | null; onClose: () => void; onSave: (data: Omit<Faq, 'id' | 'faq_code'>) => void }) {
  const [value, setValue] = useState({ category: faq?.category || '采购流程', question: faq?.question || '', answer: faq?.answer || '' })
  const [error, setError] = useState('')
  const save = () => {
    if (!value.question.trim() || !value.answer.trim()) { setError('请填写提问/搜索词和答案后再保存。'); return }
    onSave({ category: value.category, question: value.question.trim(), answer: value.answer.trim() })
  }
  return <Modal title={faq ? '编辑 FAQ' : '新增 FAQ'} onClose={onClose}>
    <div className="form-fields faq-form-fields">
      <label>类型<select value={value.category} onChange={event => setValue(previous => ({ ...previous, category: event.target.value }))}>{FAQ_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label>提问 / 搜索词<textarea className="faq-question-input" value={value.question} onChange={event => { setValue(previous => ({ ...previous, question: event.target.value })); setError('') }} /></label>
      <label>答案<textarea value={value.answer} onChange={event => { setValue(previous => ({ ...previous, answer: event.target.value })); setError('') }} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <FormActions onClose={onClose} onSave={save} />
  </Modal>
}
function KnowledgeForm({ onClose, onSave }: { onClose: () => void; onSave: (data: Omit<Knowledge, 'id'>) => void }) { const [value, setValue] = useState<Record<string, string>>({ name: '', category: '产品与服务', content: '' }); return <Modal title="新增知识" onClose={onClose}><FormFields value={value} setValue={setValue} fields={[['name', '知识名称'], ['category', '知识类型'], ['content', '知识内容', true]]}/><FormActions onClose={onClose} onSave={() => onSave(value as Omit<Knowledge, 'id'>)} /></Modal> }
function FormFields({ value, setValue, fields }: { value: Record<string, string>; setValue: React.Dispatch<React.SetStateAction<Record<string, string>>>; fields: [string, string, boolean?][] }) { return <div className="form-fields">{fields.map(([key, label, area]) => <label key={key}>{label}{area ? <textarea value={value[key]} onChange={event => setValue(previous => ({ ...previous, [key]: event.target.value }))} /> : <input value={value[key]} onChange={event => setValue(previous => ({ ...previous, [key]: event.target.value }))} />}</label>)}</div> }
function FormActions({ onClose, onSave }: { onClose: () => void; onSave: () => void }) { return <footer className="form-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={onSave}>保存</button></footer> }
