import { useState, useEffect } from 'react'
import { Search, LogOut, Sparkles, X, Copy, Loader2, CheckCircle2, Circle, FileText, ShieldCheck, ArrowLeft, Trash2, PenLine, Database, Plus, Lock, Globe } from 'lucide-react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [results, setResults] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState("")
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  const [quickNote, setQuickNote] = useState("")
  const [quickNoteVisibility, setQuickNoteVisibility] = useState("private")
  const [noteLoading, setNoteLoading] = useState(false)
  const [role, setRole] = useState(null)
  const [stats, setStats] = useState({ totalAssets: 0 })
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); if (session) fetchRoleAndStats(session.user.id); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session); if (session) fetchRoleAndStats(session.user.id)
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchRoleAndStats = async (userId) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    setRole(data?.role || 'user')
    const { count } = await supabase.from('asset_chunks').select('*', { count: 'exact', head: true })
    setStats({ totalAssets: count || 0 })
  }

  // 搜索逻辑：多关键字匹配 + 密度打分排序
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true); setHasSearched(true)
    const keywords = searchQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');
    try {
      let query = supabase.from('asset_chunks').select('*')
      if (keywords.length > 0) { query = query.or(keywords.map(kw => `content.ilike.%${kw}%`).join(',')) }
      const { data, error } = await query.limit(100)
      if (error) throw error
      let processed = (data || []).map(item => {
        let score = 0; const c = (item.content || "").toLowerCase();
        keywords.forEach(kw => { const k = kw.toLowerCase(); let p = c.indexOf(k); while (p !== -1) { score++; p = c.indexOf(k, p + 1) } })
        return { ...item, _score: score }
      })
      setResults(processed.sort((a, b) => b._score - a._score))
    } catch (e) { alert("调取失败: " + e.message) } finally { setIsSearching(false) }
  }

  // 高亮逻辑
  const highlightText = (text) => {
    const keywords = searchQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');
    if (!keywords.length || !text) return text;
    const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.split(regex).map((part, i) => regex.test(part) ? <mark key={i} style={{ backgroundColor: '#fef08a', borderRadius: '2px' }}>{part}</mark> : part);
  };

  const handleReconstruct = async () => {
    if (role !== 'superadmin') return;
    const content = results.filter(i => selectedIds.includes(i.id)).map((i, idx) => `【素材${idx + 1}】:\n${i.content}`).join('\n\n---\n\n');
    setIsModalOpen(true); setAiLoading(true); setAiResult("🚀 正在智能重构知识...")
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: "你是一个资深知识主编，请将素材进行语义去重并重构为Markdown报告。" }, { role: "user", content: content }] })
      });
      const data = await res.json(); setAiResult(data.choices[0].message.content)
    } catch (e) { setAiResult("重构失败: " + e.message) } finally { setAiLoading(false) }
  }

  const handleAddQuickNote = async () => {
    if (!quickNote.trim()) return; setNoteLoading(true)
    try {
      const { error } = await supabase.from('asset_chunks').insert({ id: crypto.randomUUID(), content: quickNote.trim(), user_id: session.user.id, visibility: quickNoteVisibility })
      if (error) throw error; setQuickNote(""); setIsNoteModalOpen(false); fetchRoleAndStats(session.user.id); alert("已存入")
    } catch (e) { alert("失败: " + e.message) } finally { setNoteLoading(false) }
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: '20px' }}>
        <div style={{ background: 'white', padding: '40px 24px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', textAlign: 'center', width: '100%', maxWidth: '360px' }}>
          <div style={{ background: '#4F46E5', width: '64px', height: '64px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
             <img src="/logo.png" alt="Logo" style={{ width: '36px', height: '36px' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '32px' }}>Brain Vault</h2>
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={async (e) => { e.preventDefault(); setAuthLoading(true); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) alert("失败"); setAuthLoading(false); }}>
            <input type="email" placeholder="账号" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none' }} />
            <input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none' }} />
            <button type="submit" disabled={authLoading} style={{ width: '100%', background: '#0f172a', color: 'white', padding: '16px', borderRadius: '12px', fontWeight: '600' }}>登 录</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: '100px' }}>
      <header style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '26px', height: '26px' }} />
          <div><h1 style={{ fontSize: '17px', fontWeight: '800', margin: 0 }}>Brain Vault</h1>{role === 'superadmin' && <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: '600' }}>Super Admin</span>}</div>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none' }}><LogOut size={20} /></button>
      </header>

      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        {role === 'superadmin' && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{ flex: 1, background: 'white', padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Database size={20} color="#4F46E5" /><div><p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>总资产</p><h3 style={{ margin: 0 }}>{stats.totalAssets}</h3></div>
            </div>
            <div onClick={() => setIsNoteModalOpen(true)} style={{ background: '#4F46E5', color: 'white', padding: '16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><Plus size={20} /><span>随心记</span></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
            <input type="text" placeholder="多关键字检索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: '14px', border: 'none', outline: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }} />
          </div>
          <button onClick={handleSearch} style={{ background: '#0f172a', color: 'white', padding: '0 24px', borderRadius: '14px', border: 'none' }}>调取</button>
        </div>

        {hasSearched ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {results.length ? results.map(i => (
              <div key={i.id} onClick={() => { if(selectedIds.includes(i.id)) setSelectedIds(selectedIds.filter(x => x !== i.id)); else setSelectedIds([...selectedIds, i.id]) }} style={{ background: selectedIds.includes(i.id) ? '#EEF2FF' : 'white', padding: '16px', borderRadius: '12px', border: selectedIds.includes(i.id) ? '2px solid #4F46E5' : '2px solid transparent', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {selectedIds.includes(i.id) ? <CheckCircle2 size={20} color="#4F46E5" /> : <Circle size={20} color="#cbd5e1" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                      {i.visibility === 'private' ? <span style={{ fontSize: '10px', color: '#10b981' }}>🔒 私密</span> : <span style={{ fontSize: '10px', color: '#3b82f6' }}>🌐 公开</span>}
                      {i._score > 1 && <span style={{ fontSize: '10px', color: '#ef4444' }}>权重 {i._score}</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', whiteSpace: 'pre-wrap' }}>{highlightText(i.content)}</p>
                  </div>
                </div>
              </div>
            )) : <p style={{ textAlign: 'center', color: '#94a3b8' }}>无匹配记忆</p>}
          </div>
        ) : <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: '40px' }}><Sparkles size={40} style={{ margin: '0 auto 12px', opacity: 0.1 }} /><p>输入关键词唤醒记忆</p></div>}

        {selectedIds.length > 0 && (
          <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', color: 'white', padding: '12px 20px', borderRadius: '100px', display: 'flex', gap: '20px', alignItems: 'center', zIndex: 50 }}>
            <span style={{ fontSize: '14px' }}>已选 {selectedIds.length} 项</span>
            {role === 'superadmin' ? <button onClick={handleReconstruct} style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '50px' }}>AI 重构</button> : <button onClick={() => { navigator.clipboard.writeText(results.filter(i => selectedIds.includes(i.id)).map(i => i.content).join('\n\n')); alert("已复制"); }} style={{ background: 'white', color: '#0f172a', border: 'none', padding: '8px 16px', borderRadius: '50px' }}>复制</button>}
          </div>
        )}
      </main>

      {/* 弹窗：随心记 */}
      {isNoteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '20px', padding: '24px' }}>
            <h3 style={{ marginTop: 0 }}>随心记</h3>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
              <label><input type="radio" checked={quickNoteVisibility === 'private'} onChange={() => setQuickNoteVisibility('private')} /> 私密</label>
              <label><input type="radio" checked={quickNoteVisibility === 'public'} onChange={() => setQuickNoteVisibility('public')} /> 公开</label>
            </div>
            <textarea value={quickNote} onChange={e => setQuickNote(e.target.value)} style={{ width: '100%', height: '120px', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1' }} />
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button onClick={() => setIsNoteModalOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>取消</button>
              <button onClick={handleAddQuickNote} disabled={noteLoading} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#4F46E5', color: 'white' }}>存入</button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗：AI 结果 */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>返回</button>
              <h3 style={{ margin: 0 }}>知识重构报告</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none' }}><X /></button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap' }}>{aiLoading ? <Loader2 className="animate-spin" /> : aiResult}</div>
            {!aiLoading && <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}><button onClick={() => { navigator.clipboard.writeText(aiResult); alert("已复制"); }} style={{ width: '100%', padding: '14px', borderRadius: '10px', background: '#0f172a', color: 'white' }}>复制报告</button></div>}
          </div>
        </div>
      )}
    </div>
  )
}
export default App