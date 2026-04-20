import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { 
  Search,FileText, LogOut, Sparkles, 
  X, Copy, ShieldCheck, BarChart3, Lock, Mail, Loader2, Users, PenTool
} from 'lucide-react'

function App() {
  // --- 状态管理 ---
  const [session, setSession] = useState(null)
  const [role, setRole] = useState('user') 
  const [activeTab, setActiveTab] = useState('search') // search | note | admin
  const [stats, setStats] = useState({ assets: 0, chunks: 0 })
  const [allUsers, setAllUsers] = useState([])
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  
  // ✨ 随手记专属状态
  const [noteContent, setNoteContent] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)

  const [aiResult, setAiResult] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  // --- 1. 初始化与身份监听 ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUserProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchUserProfile(session.user.id)
      } else {
        setRole('user')
        setResults([])
        setSelectedIds([])
        setActiveTab('search') // 退出时重置 tab
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (uid) => {
    try {
      const { data } = await supabase.from('profiles').select('role').eq('id', uid).single()
      if (data) {
        setRole(data.role)
        // 只有超管才去拉取全库数据和用户列表
        if (data.role === 'superadmin') {
          fetchSystemStats()
          fetchAllUsers()
        }
      }
    } catch (e) { console.error("身份读取失败:", e) }
  }

  const fetchSystemStats = async () => {
    const { count: aCount } = await supabase.from('assets').select('*', { count: 'exact', head: true })
    const { count: cCount } = await supabase.from('asset_chunks').select('*', { count: 'exact', head: true })
    setStats({ assets: aCount || 0, chunks: cCount || 0 })
  }

  const fetchAllUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('role', { ascending: false })
    if (data) setAllUsers(data)
  }

  const toggleUserRole = async (targetUid, currentRole) => {
    const newRole = currentRole === 'superadmin' ? 'user' : 'superadmin'
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', targetUid)
    if (!error) {
      alert(`权限已切换为: ${newRole}`)
      fetchAllUsers()
    }
  }

  // --- 3. 业务逻辑 ---
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert("验证失败，请检查账号密码")
    setLoading(false)
  }

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setSelectedIds([]);
    try {
      const kwList = keyword.split(/[\s,，]+/).filter(k => k.length > 0);
      let query = supabase.from('asset_chunks').select(`id, content, assets!inner (file_name)`);
      kwList.forEach(word => { query = query.ilike('content', `%${word}%`); });
      const { data, error } = await query.limit(50);
      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      alert('检索失败，请检查网络');
    } finally {
      setLoading(false);
    }
  }

  // ✨ 灵感随手记保存逻辑 (带 Private 标签)
  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim() || role !== 'superadmin') return;
    
    setIsSavingNote(true);
    try {
      const assetUuid = crypto.randomUUID(); 
      const chunkId = Date.now(); 
      
      const now = new Date();
      const timeStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;
      const fileName = `随手记_${timeStr}.md`;

      // 1. 写入 assets 表，强制设为 private
      const { error: assetErr } = await supabase.from('assets').insert({
        uuid: assetUuid,
        file_name: fileName,
        file_path: `Mobile/Notes/${fileName}`,
        extension: '.md',
        file_size: new Blob([noteContent]).size,
        md5: `note-${chunkId}`,
        access_level: 'private' // 🔒 绝对私密
      });
      if (assetErr) throw assetErr;

      // 2. 写入 asset_chunks 表
      const { error: chunkErr } = await supabase.from('asset_chunks').insert({
        id: chunkId,
        asset_uuid: assetUuid,
        content: noteContent.trim(),
        tags: '随手记 | 灵感'
      });
      if (chunkErr) throw chunkErr;

      alert('✅ 灵感已安全存入云端知识库！(私密级)');
      setNoteContent(''); 
      fetchSystemStats(); 
    } catch (err) {
      alert('保存失败: ' + err.message);
    } finally {
      setIsSavingNote(false);
    }
  }

  // AI 重构逻辑
  const handleReconstruct = async () => {
    if (role !== 'superadmin') return;
    const selectedContent = results.filter(item => selectedIds.includes(item.id)).map((item, i) => `【素材${i + 1}】: ${item.content}`).join('\n\n');
    setIsModalOpen(true);
    setAiLoading(true);
    setAiResult("🚀 正在跨时空调取 AI 算力，请稍候...");
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
          'Content-Type': 'application/json' 
     },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            { role: "system", content: "你是一个资深知识主编，请将素材进行语义去重并重构为逻辑连贯的Markdown报告。要求：保留专业术语，去除废话。" },
            { role: "user", content: selectedContent }
          ],
        })
      });
      const data = await response.json();
      setAiResult(data.choices[0].message.content);
    } catch (e) { setAiResult("重构失败: " + e.message); }
    finally { setAiLoading(false); }
  }

  // 黄标高亮渲染
  const highlightText = (text, rawHighlight) => {
    if (!rawHighlight.trim()) return text;
    const kwList = rawHighlight.split(/[\s,，]+/).filter(k => k.length > 0);
    if (kwList.length === 0) return text;
    const pattern = `(${kwList.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
    const regex = new RegExp(pattern, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) => 
      kwList.some(kw => kw.toLowerCase() === part.toLowerCase()) ? (
        <mark key={index} style={{ backgroundColor: '#fef08a', color: '#9a3412', fontWeight: 'bold', padding: '0 2px', borderRadius: '4px' }}>{part}</mark>
      ) : part
    );
  };

  // --- UI 渲染: 登录页 (低调版) ---
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px', fontFamily: 'system-ui' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: '64px', height: '64px', background: '#4F46E5', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <img src="/logo.png" alt="Brain Vault Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', margin: '0' }}>Brain Vault</h2>
            <p style={{ color: '#64748b', marginTop: '8px' }}>知识资产安全中心</p>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ position: 'relative' }}>
              <Mail style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} size={20} />
              <input type="email" placeholder="电子邮箱" required value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px 12px 12px 42px', borderRadius: '12px', border: '1px solid #e2e8f0', boxSizing: 'border-box', fontSize: '16px' }} />
            </div>
            <div style={{ position: 'relative' }}>
              <Lock style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} size={20} />
              <input type="password" placeholder="访问密码" required value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '12px 12px 12px 42px', borderRadius: '12px', border: '1px solid #e2e8f0', boxSizing: 'border-box', fontSize: '16px' }} />
            </div>
            <button type="submit" disabled={loading} style={{ padding: '14px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {loading ? <Loader2 className="animate-spin" size={20} /> : "身份验证"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- UI 渲染: 主内容页 (权限分发) ---
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '15px', fontFamily: 'system-ui', paddingBottom: '100px' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#4F46E5', padding: '6px', borderRadius: '8px', display: 'flex' }}>
  <img src="/logo.png" alt="Logo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
</div>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#1e293b' }}>Brain Vault</h2>
          {/* 超管绿标 */}
          {role === 'superadmin' && <ShieldCheck size={22} color="#10b981" />}
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ border: 'none', background: '#f1f5f9', padding: '8px 12px', borderRadius: '8px', color: '#64748b' }}><LogOut size={18} /></button>
      </header>

      {/* Tabs (仅超管可见全部，普通用户什么都不显示，直接处于 search 模式) */}
      {role === 'superadmin' && (
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', marginBottom: '24px' }}>
          <button onClick={() => setActiveTab('search')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '10px', background: activeTab === 'search' ? 'white' : 'transparent', fontWeight: activeTab === 'search' ? 'bold' : 'normal', color: activeTab === 'search' ? '#4F46E5' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Search size={18} /> 检索
          </button>
          <button onClick={() => setActiveTab('note')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '10px', background: activeTab === 'note' ? 'white' : 'transparent', fontWeight: activeTab === 'note' ? 'bold' : 'normal', color: activeTab === 'note' ? '#4F46E5' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <PenTool size={18} /> 随手记
          </button>
          <button onClick={() => setActiveTab('admin')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '10px', background: activeTab === 'admin' ? 'white' : 'transparent', fontWeight: activeTab === 'admin' ? 'bold' : 'normal', color: activeTab === 'admin' ? '#4F46E5' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <BarChart3 size={18} /> 看板
          </button>
        </div>
      )}

      {/* --- 内容区: 检索 --- */}
      {activeTab === 'search' && (
        <>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索关键词，空格分隔..." style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', fontSize: '16px', outline: 'none' }} />
            <button type="submit" style={{ padding: '0 20px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '14px' }}><Search size={22} /></button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {results.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])} 
                style={{ padding: '16px', borderRadius: '16px', border: '2px solid', borderColor: selectedIds.includes(item.id) ? '#4F46E5' : '#f1f5f9', backgroundColor: selectedIds.includes(item.id) ? '#f5f3ff' : 'white', transition: 'all 0.2s' }}
              >
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={14} /> {item.assets?.file_name}
                </div>
                <p style={{ margin: 0, fontSize: '15px', lineHeight: '1.6', color: '#334155' }}>
                  {highlightText(item.content, keyword)}
                </p>
              </div>
            ))}
            {results.length === 0 && <div style={{textAlign:'center', color:'#94a3b8', marginTop:'40px'}}>输入关键词开始跨设备检索</div>}
          </div>
        </>
      )}

      {/* --- 内容区: 随手记 (仅超管可见) --- */}
      {activeTab === 'note' && role === 'superadmin' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <h3 style={{ marginTop: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <PenTool color="#4F46E5" /> 捕获灵感
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
            在这里记录的文字将立即作为<strong>私密资产</strong>存入云端，普通用户不可见，且即刻可被检索和 AI 重构。
          </p>
          <form onSubmit={handleSaveNote}>
            <textarea 
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="此刻你在想什么？..."
              style={{ width: '100%', height: '180px', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: '16px', resize: 'none', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', lineHeight: '1.6' }}
              required
            />
            <button 
              type="submit" disabled={isSavingNote}
              style={{ marginTop: '16px', width: '100%', padding: '14px', background: '#10b981', color: 'white', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            >
              {isSavingNote ? <Loader2 className="animate-spin" size={20} /> : "💾 安全存档至云端"}
            </button>
          </form>
        </div>
      )}

      {/* --- 内容区: 管理看板 (仅超管可见) --- */}
      {activeTab === 'admin' && role === 'superadmin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ color: '#64748b', fontSize: '13px' }}>云端文件</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4F46E5' }}>{stats.assets}</div>
            </div>
            <div style={{ background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ color: '#64748b', fontSize: '13px' }}>知识碎片</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4F46E5' }}>{stats.chunks}</div>
            </div>
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={20} color="#4F46E5" /> 用户权限管理</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {allUsers.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                    <div style={{ fontSize: '11px', color: u.role === 'superadmin' ? '#10b981' : '#64748b' }}>{u.role === 'superadmin' ? '超级管理员' : '普通用户'}</div>
                  </div>
                  {u.id !== session.user.id && (
                    <button onClick={() => toggleUserRole(u.id, u.role)} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>切换</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- 悬浮栏: AI 重构 (仅超管可见) --- */}
      {selectedIds.length >= 1 && activeTab === 'search' && role === 'superadmin' && (
        <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '500px', background: '#1e293b', color: 'white', padding: '16px 20px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', zIndex: 100 }}>
          <span style={{ fontWeight: '500' }}>已选中 {selectedIds.length} 项</span>
          <button onClick={handleReconstruct} style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={18} /> AI 重构
          </button>
        </div>
      )}

      {/* AI 结果弹窗 */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'white', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '18px' }}>🧩 AI 知识重构报告</h3>
            <button onClick={() => setIsModalOpen(false)} style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', padding: '8px' }}><X size={20} /></button>
          </div>
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#334155', fontSize: '16px' }}>
            {aiResult}
          </div>
          <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <button onClick={() => { navigator.clipboard.writeText(aiResult); alert('已复制到剪贴板') }} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: '600' }}><Copy size={20} /> 复制全文报告</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App