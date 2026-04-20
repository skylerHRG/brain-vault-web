import { useState, useEffect } from 'react'
import { 
  Search, LogOut, Sparkles, X, Copy, 
  Loader2, CheckCircle2, Circle, FileText, 
  ShieldCheck, ArrowLeft, Trash2, PenLine, Database, Plus,
  Lock, Globe 
} from 'lucide-react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false) // 关键：记录用户是否进行过搜索
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
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // 1. 初始化
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchRoleAndStats(session.user.id)
        // 🌟 移除自动搜索 handleSearch("", true)，保持首页清爽
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRoleAndStats(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchRoleAndStats = async (userId) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    const userRole = data ? data.role : 'user'
    setRole(userRole)

    if (userRole === 'superadmin') {
      const { count } = await supabase.from('asset_chunks').select('*', { count: 'exact', head: true })
      setStats({ totalAssets: count || 0 })
    }
  }

  // 移动端排版保护逻辑
  useEffect(() => {
    if (isModalOpen || isNoteModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.position = 'static';
    }
  }, [isModalOpen, isNoteModalOpen])

  // ================= 搜索逻辑 =================
  const handleSearch = async () => {
    if (!searchQuery.trim()) return; // 空搜索不响应，防止误触导致全量展示
    
    setIsSearching(true)
    setHasSearched(true) // 标记为已搜索状态
    const keywords = searchQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');

    try {
      let query = supabase.from('asset_chunks').select('*');
      
      const orString = keywords.map(kw => `content.ilike.%${kw}%`).join(',');
      query = query.or(orString);

      const { data, error } = await query;
      if (error) throw error;

      let processedData = data || [];

      // 智能排序
      if (processedData.length > 0) {
        processedData = processedData.map(item => {
          let score = 0;
          const contentLower = item.content.toLowerCase();
          keywords.forEach(kw => {
            const kwLower = kw.toLowerCase();
            let pos = contentLower.indexOf(kwLower);
            while (pos !== -1) {
              score++;
              pos = contentLower.indexOf(kwLower, pos + 1);
            }
          });
          return { ...item, _matchScore: score };
        });
        processedData.sort((a, b) => b._matchScore - a._matchScore);
      }
      setResults(processedData)
    } catch (err) {
      alert("读取失败: " + err.message);
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }

  const highlightText = (text) => {
    const keywords = searchQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');
    if (keywords.length === 0) return text;
    const safeKeywords = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${safeKeywords.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => regex.test(part) ? <mark key={i} style={{ backgroundColor: '#fef08a', color: '#0f172a', padding: '0 2px', borderRadius: '3px', fontWeight: 'bold' }}>{part}</mark> : <span key={i}>{part}</span>);
  };

  const handleReconstruct = async () => {
    if (role !== 'superadmin') return;
    const selectedContent = results.filter(item => selectedIds.includes(item.id)).map((item, i) => `【素材${i + 1}】:\n${item.content}`).join('\n\n---\n\n');
    setIsModalOpen(true)
    setAiLoading(true)
    setAiResult("🚀 正在智能提炼并重构知识，请稍候...")
    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: "你是一个资深知识主编，请将素材进行语义去重并重构为逻辑连贯的Markdown报告。要求：保留专业术语，去除废话，排版清晰美观。" }, { role: "user", content: selectedContent }],
        })
      });
      const data = await response.json();
      setAiResult(data.choices[0].message.content);
    } catch (e) { setAiResult("❌ 重构失败: " + e.message); } finally { setAiLoading(false); }
  }

  const handleAddQuickNote = async () => {
    if (!quickNote.trim()) return;
    setNoteLoading(true);
    try {
      const { error } = await supabase.from('asset_chunks').insert({
        id: crypto.randomUUID(),
        content: quickNote.trim(),
        user_id: session.user.id, 
        visibility: quickNoteVisibility 
      });
      if (error) throw error;
      setQuickNote("");
      setIsNoteModalOpen(false);
      alert("存入成功");
      fetchRoleAndStats(session.user.id);
    } catch (e) { alert("存入失败: " + e.message); } finally { setNoteLoading(false); }
  }

  const toggleSelection = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(item => item !== id));
    else setSelectedIds([...selectedIds, id]);
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("验证失败");
    setAuthLoading(false);
  };

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: '20px' }}>
        <div style={{ background: 'white', padding: '40px 24px', borderRadius: '24px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)', textAlign: 'center', width: '100%', maxWidth: '360px', boxSizing: 'border-box' }}>
          <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', width: '72px', height: '72px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
             <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px' }} />
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', marginBottom: '32px' }}>Brain Vault</h2>
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleEmailLogin}>
            <input type="email" placeholder="系统账号" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
            <input type="password" placeholder="访问密码" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none' }} />
            <button type="submit" disabled={authLoading} style={{ width: '100%', background: '#0f172a', color: 'white', padding: '16px', borderRadius: '12px', fontWeight: '600', fontSize: '16px', marginTop: '8px' }}>
              {authLoading ? '...' : '登 录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: '120px' }}>
      
      {/* 顶部导航 */}
      <header style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '26px', height: '26px', borderRadius: '6px' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Brain Vault</h1>
            {role === 'superadmin' && <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}><ShieldCheck size={12} /> Super Admin</span>}
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#64748b' }}><LogOut size={20} /></button>
      </header>

      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* 看板与随心说按钮 */}
        {role === 'superadmin' && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{ flex: 1, background: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#EEF2FF', padding: '10px', borderRadius: '12px', color: '#4F46E5' }}><Database size={20} /></div>
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>总资产</p>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>{stats.totalAssets} <span style={{ fontSize: '14px', color: '#94a3b8' }}>项</span></h3>
              </div>
            </div>
            <div onClick={() => setIsNoteModalOpen(true)} style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: 'white', padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)' }}>
              <Plus size={24} /><span style={{ fontSize: '13px', fontWeight: '600' }}>随心记</span>
            </div>
          </div>
        )}

        {/* 搜索框：核心入口 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <div style={{ flex: '1', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
            <input type="text" placeholder="输入关键字调取记忆..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleKeyDown} style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: '14px', border: 'none', fontSize: '16px', fontWeight: '500', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', outline: 'none' }} />
          </div>
          <button onClick={() => handleSearch()} disabled={isSearching} style={{ background: '#0f172a', color: 'white', padding: '0 24px', borderRadius: '14px', border: 'none', fontWeight: '600' }}>
            {isSearching ? <Loader2 size={18} className="animate-spin" /> : '调取'}
          </button>
        </div>

        {/* 结果列表：只有在搜索后才显示 */}
        {hasSearched ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {results.length > 0 ? (
              results.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div key={item.id} onClick={() => toggleSelection(item.id)} style={{ background: isSelected ? '#EEF2FF' : 'white', padding: '20px', borderRadius: '16px', border: isSelected ? '2px solid #4F46E5' : '2px solid transparent', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ flexShrink: 0, marginTop: '2px' }}>{isSelected ? <CheckCircle2 size={24} color="#4F46E5" fill="#EEF2FF" /> : <Circle size={24} color="#cbd5e1" />}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          {item._matchScore > 0 && <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold', background: '#fee2e2', padding: '2px 8px', borderRadius: '10px' }}>命中 {item._matchScore}</span>}
                          {item.visibility === 'private' ? <span style={{ fontSize: '11px', color: '#10b981', background: '#d1fae5', padding: '2px 8px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}><Lock size={10} /> 私密</span> : <span style={{ fontSize: '11px', color: '#3b82f6', background: '#dbeafe', padding: '2px 8px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={10} /> 公开</span>}
                        </div>
                        <p style={{ color: isSelected ? '#1e1b4b' : '#334155', lineHeight: 1.6, fontSize: '15px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{highlightText(item.content)}</p>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                <FileText size={48} strokeWidth={1} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                <p>未找到相关记忆</p>
              </div>
            )}
          </div>
        ) : (
          /* 初始状态提示 */
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <Sparkles size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: '15px' }}>请输入关键词调取您的数字资产</p>
          </div>
        )}

        {/* 悬浮多选操作栏 */}
        {selectedIds.length > 0 && (
          <div style={{ position: 'fixed', bottom: '30px', left: '0', right: '0', margin: '0 auto', width: 'calc(100% - 40px)', maxWidth: '450px', background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(16px)', color: 'white', padding: '12px 16px', borderRadius: '100px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', zIndex: 50 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', paddingLeft: '8px' }}>已选 {selectedIds.length} 项</span>
              <button onClick={() => setSelectedIds([])} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1', padding: '6px 10px', borderRadius: '50px', fontSize: '12px' }}>清空</button>
            </div>
            {role === 'superadmin' ? <button onClick={handleReconstruct} style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '100px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={18} /> 生成报告</button> : <button onClick={() => { const c = results.filter(i => selectedIds.includes(i.id)).map(i => i.content).join('\n\n'); navigator.clipboard.writeText(c); alert("已复制"); }} style={{ background: 'white', color: '#0f172a', border: 'none', padding: '10px 20px', borderRadius: '100px', fontWeight: '600' }}><Copy size={18} /> 复制</button>}
          </div>
        )}
      </main>

      {/* 随心记模态框 */}
      {isNoteModalOpen && (
        <div onClick={(e) => e.target === e.currentTarget && setIsNoteModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '24px', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}><PenLine size={20} color="#4F46E5" /> 随心记</h3>
              <button onClick={() => setIsNoteModalOpen(false)} style={{ background: 'none', border: 'none' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '24px', background: '#fafafa' }}>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: quickNoteVisibility === 'private' ? '#10b981' : '#64748b', fontWeight: '600' }}><input type="radio" value="private" checked={quickNoteVisibility === 'private'} onChange={(e) => setQuickNoteVisibility(e.target.value)} /> <Lock size={14} /> 仅自己</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: quickNoteVisibility === 'public' ? '#3b82f6' : '#64748b', fontWeight: '600' }}><input type="radio" value="public" checked={quickNoteVisibility === 'public'} onChange={(e) => setQuickNoteVisibility(e.target.value)} /> <Globe size={14} /> 公开</label>
              </div>
              <textarea placeholder="记下此刻的灵感..." value={quickNote} onChange={(e) => setQuickNote(e.target.value)} style={{ width: '100%', height: '140px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', resize: 'none', fontSize: '16px' }} />
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setIsNoteModalOpen(false)} style={{ flex: 1, background: '#f8fafc', padding: '14px', borderRadius: '12px', fontWeight: '600' }}>取消</button>
              <button onClick={handleAddQuickNote} disabled={noteLoading} style={{ flex: 2, background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: 'white', padding: '14px', borderRadius: '12px', fontWeight: '600' }}>{noteLoading ? '...' : '存入知识库'}</button>
            </div>
          </div>
        </div>
      )}

      {/* AI 报告弹窗 */}
      {isModalOpen && (
        <div onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setIsModalOpen(false)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px', fontWeight: '600' }}><ArrowLeft size={18} /></button>
                <h3 style={{ fontWeight: '800' }}>知识融合报告</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, background: '#fafafa' }}>
              {aiLoading ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Loader2 className="animate-spin" size={40} color="#4F46E5" /><p>{aiResult}</p></div> : <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.8, fontSize: '16px' }}>{aiResult}</div>}
            </div>
            {!aiLoading && (
              <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px' }}>
                <button onClick={() => setIsModalOpen(false)} style={{ flex: 1, background: '#f8fafc', padding: '16px', borderRadius: '14px', fontWeight: '600' }}>关闭</button>
                <button onClick={() => { navigator.clipboard.writeText(aiResult); alert("已复制"); }} style={{ flex: 2, background: '#0f172a', color: 'white', padding: '16px', borderRadius: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Copy size={20} /> 复制全部</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App