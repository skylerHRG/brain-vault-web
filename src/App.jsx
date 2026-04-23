import { useState, useEffect } from 'react'
import { 
  Search, LogOut, Sparkles, X, Copy, 
  Loader2, CheckCircle2, Circle, FileText, 
  ShieldCheck, ArrowLeft, Trash2, PenLine, Database, Plus,
  Lock, Globe, Eye, Link, Clock, Layers
} from 'lucide-react'
import { supabase } from './supabaseClient'

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '未知大小';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
  const [stats, setStats] = useState({ files: 0, chunks: 0 })
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRoleAndStats(session.user.id)
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
      const { count: fileCount } = await supabase.from('assets').select('*', { count: 'exact', head: true });
      const { count: chunkCount } = await supabase.from('asset_chunks').select('*', { count: 'exact', head: true });
      setStats({ files: fileCount || 0, chunks: chunkCount || 0 });
    }
  }

  useEffect(() => {
    const isAnyModalOpen = isModalOpen || isNoteModalOpen;
    document.body.style.overflow = isAnyModalOpen ? 'hidden' : 'unset';
    if (isAnyModalOpen) {
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.position = 'static';
    }
  }, [isModalOpen, isNoteModalOpen])

  // ================= 核心：双引擎全息检索 =================
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true)
    setHasSearched(true)
    const keywords = searchQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');

    try {
      // 引擎 A：搜文本内容
      let queryChunks = supabase.from('asset_chunks').select('*, assets(*)');
      // 引擎 B：搜物理文件名
      let queryAssets = supabase.from('assets').select('*'); 
      
      if (keywords.length > 0) {
        const orChunks = keywords.map(kw => `content.ilike.%${kw}%`).join(',');
        queryChunks = queryChunks.or(orChunks);

        const orAssets = keywords.map(kw => `file_name.ilike.%${kw}%`).join(',');
        queryAssets = queryAssets.or(orAssets);
      }

      // 并发执行双引擎
      const [resChunks, resAssets] = await Promise.all([
        queryChunks.limit(60),
        queryAssets.limit(60)
      ]);

      if (resChunks.error) throw resChunks.error;

      let chunksData = resChunks.data || [];
      let assetsData = resAssets.data || [];

      // 排重逻辑：如果文件名搜到了，但它已经有文本碎片被搜到了，就不重复显示
      const matchedAssetUuids = new Set(chunksData.filter(c => c.asset_uuid).map(c => c.asset_uuid));

      // 把没有对应文本的图片/视频，包装成“虚假碎片”显示出来
      let mappedAssets = assetsData
        .filter(a => !matchedAssetUuids.has(a.uuid))
        .map(a => ({
          id: a.uuid, 
          content: `📁 [物理原文件] ${a.file_name || '未命名文件'}`,
          user_id: session.user.id, // 上帝视角默认挂载
          visibility: a.access_level || 'private',
          assets: a
        }));

      let processedData = [...chunksData, ...mappedAssets];

      // 智能打分排序
      if (keywords.length > 0 && processedData.length > 0) {
        processedData = processedData.map(item => {
          let score = 0;
          const contentLower = (item.content || "").toLowerCase();
          keywords.forEach(kw => {
            const kwLower = kw.toLowerCase();
            let pos = contentLower.indexOf(kwLower);
            while (pos !== -1) { score++; pos = contentLower.indexOf(kwLower, pos + 1); }
          });
          return { ...item, _matchScore: score };
        });
        processedData.sort((a, b) => b._matchScore - a._matchScore);
      }

      setResults(processedData)
    } catch (err) {
      alert("全息检索失败: " + err.message);
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
    if (keywords.length === 0 || !text) return text;
    const safeKeywords = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${safeKeywords.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => regex.test(part) ? <mark key={i} style={{ backgroundColor: '#fef08a', color: '#0f172a', padding: '0 2px', borderRadius: '3px', fontWeight: 'bold' }}>{part}</mark> : <span key={i}>{part}</span>);
  };

  const handleReconstruct = async () => {
    if (role !== 'superadmin') return;
    const selectedContent = results.filter(item => selectedIds.includes(item.id)).map((item, i) => `【素材${i + 1}】:\n${item.content}`).join('\n\n---\n\n');
    setIsModalOpen(true); setAiLoading(true); setAiResult("🚀 PrismHub 正在后台重构多维知识...");
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
    } catch (e) { setAiResult("❌ 知识重构失败: " + e.message); } finally { setAiLoading(false); }
  }

  const handleAddQuickNote = async () => {
    if (!quickNote.trim()) return;
    setNoteLoading(true);
    try {
      const { error } = await supabase.from('asset_chunks').insert({
        id: crypto.randomUUID(),
        content: quickNote.trim(),
        user_id: session.user.id, 
        visibility: quickNoteVisibility,
        is_synced: 1 
      });
      if (error) throw error; // 如果 SQL 没跑通，这里会精准报错拦截
      
      setQuickNote(""); setIsNoteModalOpen(false); alert("灵感已成功写入中枢！");
      fetchRoleAndStats(session.user.id);
    } catch (e) { alert("写入失败 (请确保跑通了最新SQL): " + e.message); } finally { setNoteLoading(false); }
  }

  const toggleSelection = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(item => item !== id));
    else setSelectedIds([...selectedIds, id]);
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("中枢访问拒绝");
    setAuthLoading(false);
  };

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '20px' }}>
        <div style={{ background: 'white', padding: '40px 24px', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', textAlign: 'center', width: '100%', maxWidth: '360px', boxSizing: 'border-box' }}>
          <div style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #4f46e5 100%)', width: '72px', height: '72px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 20px rgba(79, 70, 229, 0.3)' }}>
             <Layers color="white" size={36} strokeWidth={2.5} />
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.5px' }}>PrismHub</h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '32px', fontWeight: '500' }}>多维数据的重构中枢</p>
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleEmailLogin}>
            <input type="email" placeholder="枢纽授权账号" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', background: '#f8fafc' }} />
            <input type="password" placeholder="访问密钥" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', background: '#f8fafc' }} />
            <button type="submit" disabled={authLoading} style={{ width: '100%', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', padding: '16px', borderRadius: '12px', fontWeight: '600', fontSize: '16px', marginTop: '8px', cursor: 'pointer' }}>
              {authLoading ? '验证中...' : '接入中枢'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: '120px' }}>
      <header style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #4f46e5 100%)', padding: '6px', borderRadius: '8px' }}>
            <Layers color="white" size={18} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>PrismHub</h1>
            {role === 'superadmin' && <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '2px' }}><ShieldCheck size={12} /> 上帝视角已激活</span>}
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><LogOut size={20} /></button>
      </header>

      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
        {role === 'superadmin' && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{ flex: 1, background: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '12px', color: '#0284c7' }}><Database size={22} /></div>
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: '600' }}>中枢数据概览</p>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  {stats.files} <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>物理文件</span> 
                  <span style={{ color: '#cbd5e1', fontWeight: '400' }}>|</span> 
                  {stats.chunks} <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>知识碎片</span>
                </h3>
              </div>
            </div>
            <div onClick={() => setIsNoteModalOpen(true)} style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)', color: 'white', padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(79, 70, 229, 0.25)' }}>
              <Plus size={26} strokeWidth={3} style={{ marginBottom: '4px' }} /><span style={{ fontSize: '13px', fontWeight: '700' }}>捕获灵感</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <div style={{ flex: '1', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
            <input type="text" placeholder="输入文件名或文本检索记忆..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleKeyDown} style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: '16px', border: '1px solid transparent', fontSize: '16px', fontWeight: '500', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', outline: 'none', transition: 'all 0.2s' }} />
          </div>
          <button onClick={handleSearch} disabled={isSearching} style={{ background: '#0f172a', color: 'white', padding: '0 24px', borderRadius: '16px', border: 'none', fontWeight: '700', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} 调取
          </button>
        </div>

        {hasSearched ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {results.length > 0 ? results.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const isMine = item.user_id === session.user.id;
              const hasAssets = item.assets != null;

              return (
                <div key={item.id} onClick={() => toggleSelection(item.id)} style={{ background: isSelected ? '#f0fdfa' : 'white', padding: '20px', borderRadius: '16px', border: isSelected ? '2px solid #10b981' : '2px solid transparent', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>{isSelected ? <CheckCircle2 size={24} color="#10b981" fill="#ecfdf5" /> : <Circle size={24} color="#cbd5e1" />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {item._matchScore > 1 && <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold', background: '#fee2e2', padding: '4px 10px', borderRadius: '100px' }}>命中 {item._matchScore}</span>}
                        {item.visibility === 'private' ? (
                          <span style={{ fontSize: '11px', color: isMine ? '#059669' : '#7c3aed', background: isMine ? '#d1fae5' : '#ede9fe', padding: '4px 10px', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: 4, fontWeight: '700' }}>
                            {isMine ? <Lock size={12} /> : <Eye size={12} />} 
                            {isMine ? '我的私有区' : '他人的私有 (上帝模式)'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#2563eb', background: '#dbeafe', padding: '4px 10px', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: 4, fontWeight: '700' }}>
                            <Globe size={12} /> 全局公开
                          </span>
                        )}
                        {hasAssets && item.assets.is_enriched === 0 && (
                           <span style={{ fontSize: '11px', color: '#d97706', background: '#fef3c7', padding: '4px 10px', borderRadius: '100px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                             <Clock size={12} /> 原件待提取文本
                           </span>
                        )}
                        {hasAssets && (
                           <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '100px', fontWeight: '600' }}>
                             {formatBytes(item.assets.file_size)}
                           </span>
                        )}
                        {hasAssets && item.assets.cloud_url && (
                          <a href={item.assets.cloud_url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#0ea5e9', background: '#e0f2fe', padding: '4px 10px', borderRadius: '100px', textDecoration: 'none', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                            <Link size={12} /> 查看原文件
                          </a>
                        )}
                      </div>
                      <p style={{ color: isSelected ? '#064e3b' : '#334155', lineHeight: 1.7, fontSize: '15px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {highlightText(item.content)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            }) : <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}><FileText size={56} strokeWidth={1} style={{ margin: '0 auto 16px', opacity: 0.4 }} /><p style={{ fontWeight: '500' }}>信息真空中，未找到相关碎片</p></div>}
          </div>
        ) : <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}><Layers size={48} strokeWidth={1.5} style={{ margin: '0 auto 16px', opacity: 0.2 }} /><p style={{ fontWeight: '500' }}>输入指令，激活 PrismHub 数据折射</p></div>}

        {selectedIds.length > 0 && (
          <div style={{ position: 'fixed', bottom: '30px', left: '0', right: '0', margin: '0 auto', width: 'calc(100% - 40px)', maxWidth: '500px', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', color: 'white', padding: '14px 20px', borderRadius: '100px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', zIndex: 50 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><span style={{ fontSize: '15px', fontWeight: '700', paddingLeft: '8px' }}>已捕获 {selectedIds.length} 个碎片</span><button onClick={() => setSelectedIds([])} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#cbd5e1', padding: '6px 12px', borderRadius: '50px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}><Trash2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> 清空</button></div>
            {role === 'superadmin' ? <button onClick={handleReconstruct} style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #4f46e5 100%)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '100px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)' }}><Sparkles size={18} /> 融合重构</button> : <button onClick={() => { const c = results.filter(i => selectedIds.includes(i.id)).map(i => i.content).join('\n\n'); navigator.clipboard.writeText(c); alert("已复制"); }} style={{ background: 'white', color: '#0f172a', border: 'none', padding: '12px 24px', borderRadius: '100px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><Copy size={18} /> 提取文本</button>}
          </div>
        )}
      </main>

      {isNoteModalOpen && (
        <div onClick={(e) => e.target === e.currentTarget && setIsNoteModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}><PenLine size={20} color="#4F46E5" /> 捕获灵感碎片</h3><button onClick={() => setIsNoteModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button></div>
            <div style={{ padding: '24px', background: '#fafafa' }}>
              <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: quickNoteVisibility === 'private' ? '#059669' : '#64748b', fontWeight: quickNoteVisibility === 'private' ? 700 : 500, cursor: 'pointer' }}><input type="radio" value="private" checked={quickNoteVisibility === 'private'} onChange={(e) => setQuickNoteVisibility(e.target.value)} /> <Lock size={14} /> 归入私有区</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: quickNoteVisibility === 'public' ? '#2563eb' : '#64748b', fontWeight: quickNoteVisibility === 'public' ? 700 : 500, cursor: 'pointer' }}><input type="radio" value="public" checked={quickNoteVisibility === 'public'} onChange={(e) => setQuickNoteVisibility(e.target.value)} /> <Globe size={14} /> 全局公开</label>
              </div>
              <textarea placeholder="记下此刻的灵感..." value={quickNote} onChange={(e) => setQuickNote(e.target.value)} style={{ width: '100%', height: '160px', padding: '16px', borderRadius: '16px', border: '1px solid #cbd5e1', outline: 'none', resize: 'none', fontSize: '16px', lineHeight: '1.6' }} />
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', gap: '12px', background: 'white' }}><button onClick={() => setIsNoteModalOpen(false)} style={{ flex: 1, background: '#f1f5f9', color: '#475569', padding: '16px', borderRadius: '14px', fontWeight: '700', border: 'none', cursor: 'pointer' }}>取消放弃</button><button onClick={handleAddQuickNote} disabled={noteLoading} style={{ flex: 2, background: 'linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)', color: 'white', padding: '16px', borderRadius: '14px', fontWeight: '700', border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.3)' }}>{noteLoading ? <Loader2 size={20} className="animate-spin" /> : '封装入库'}</button></div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><button onClick={() => setIsModalOpen(false)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '8px 14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><ArrowLeft size={16} /> 退回</button><h3 style={{ fontWeight: '900', margin: 0, color: '#0f172a' }}>PrismHub 知识矩阵图</h3></div><button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button></div>
            <div style={{ padding: '30px', overflowY: 'auto', flex: 1, background: '#fafafa' }}>{aiLoading ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4F46E5' }}><Loader2 className="animate-spin" size={48} style={{ marginBottom: '20px' }} /><p style={{ fontWeight: '600' }}>{aiResult}</p></div> : <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.8, fontSize: '16px', color: '#334155' }}>{aiResult}</div>}</div>
            {!aiLoading && <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '16px', background: 'white' }}><button onClick={() => setIsModalOpen(false)} style={{ flex: 1, background: '#f1f5f9', color: '#475569', padding: '16px', borderRadius: '16px', fontWeight: '700', border: 'none', cursor: 'pointer' }}>销毁窗口</button><button onClick={() => { navigator.clipboard.writeText(aiResult); alert("报告已提取"); }} style={{ flex: 2, background: '#0f172a', color: 'white', padding: '16px', borderRadius: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', border: 'none', cursor: 'pointer', boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }}><Copy size={20} /> 复制矩阵报告</button></div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default App