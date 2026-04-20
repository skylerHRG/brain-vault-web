import { useState, useEffect } from 'react'
import { 
  Search, LogOut, Sparkles, X, Copy, 
  Loader2, CheckCircle2, Circle, FileText, 
  ShieldCheck, ArrowLeft, Trash2, PenLine, Database, Plus,
  Lock, Globe // 新增图标用于区分公私
} from 'lucide-react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [results, setResults] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState([])
  
  // AI 弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState("")

  // 随心记（快速录入）状态
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  const [quickNote, setQuickNote] = useState("")
  const [quickNoteVisibility, setQuickNoteVisibility] = useState("private") // 新增：公私状态选择
  const [noteLoading, setNoteLoading] = useState(false)
  
  // 角色与看板状态
  const [role, setRole] = useState(null)
  const [stats, setStats] = useState({ totalAssets: 0 })
  
  // 登录表单状态
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // 1. 检查登录状态并获取权限
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchRoleAndStats(session.user.id)
        handleSearch("", true)
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
      // 这里的 count 已经受到了上面 SQL 中 RLS 策略的保护，只会查到你有权限看的数据总量
      const { count } = await supabase.from('asset_chunks').select('*', { count: 'exact', head: true })
      setStats({ totalAssets: count || 0 })
    }
  }

  useEffect(() => {
    if (isModalOpen || isNoteModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; }
  }, [isModalOpen, isNoteModalOpen])

  // ================= 核心功能 1：多词条智能搜索与排序 =================
  const handleSearch = async (overrideQuery = null, isInitial = false) => {
    setIsSearching(true)
    const currentQuery = overrideQuery !== null ? overrideQuery : searchQuery;
    const keywords = currentQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');

    try {
      // Supabase 的 RLS 策略会自动在这里拦截并只返回：所有的 public 数据 + 你自己的 private 数据
      let query = supabase.from('asset_chunks').select('*').limit(100);
      
      if (keywords.length > 0) {
        const orString = keywords.map(kw => `content.ilike.%${kw}%`).join(',');
        query = query.or(orString);
      } else {
        query = query.order('created_at', { ascending: false }).limit(30);
      }

      const { data, error } = await query;
      if (error) throw error;

      let processedData = data || [];

      if (keywords.length > 0 && processedData.length > 0) {
        processedData = processedData.map(item => {
          let score = 0;
          const contentLower = item.content.toLowerCase();
          keywords.forEach(kw => {
            const kwLower = kw.toLowerCase();
            let pos = 0;
            while (true) {
              pos = contentLower.indexOf(kwLower, pos);
              if (pos >= 0) { score++; pos += kwLower.length; }
              else break;
            }
          });
          return { ...item, _matchScore: score };
        });
        processedData.sort((a, b) => b._matchScore - a._matchScore);
      }

      setResults(processedData)
    } catch (err) {
      console.error(err);
      alert("数据读取失败: " + err.message);
    } finally {
      setIsSearching(false)
      if (!isInitial) setHasSearched(true)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }

  // ================= 核心功能 2：关键字高亮 =================
  const highlightText = (text) => {
    const keywords = searchQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');
    if (keywords.length === 0) return text;

    const safeKeywords = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${safeKeywords.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} style={{ backgroundColor: '#fef08a', color: '#0f172a', padding: '0 2px', borderRadius: '3px', fontWeight: 'bold' }}>
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  // ================= 核心功能 3：白标化 AI 重构 (仅限超级管理员) =================
  const handleReconstruct = async () => {
    if (role !== 'superadmin') return alert("权限不足");

    const selectedContent = results
      .filter(item => selectedIds.includes(item.id))
      .map((item, i) => `【素材${i + 1}】:\n${item.content}`)
      .join('\n\n---\n\n');

    setIsModalOpen(true)
    setAiLoading(true)
    setAiResult("🚀 正在智能提炼并重构知识，请稍候...")

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) throw new Error("未配置 VITE_GROQ_API_KEY");

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile", // 底层调用，绝对不在 UI 暴露
          messages: [
            { role: "system", content: "你是一个资深知识主编，请将素材进行语义去重并重构为逻辑连贯的Markdown报告。要求：保留专业术语，去除废话，排版清晰美观。" },
            { role: "user", content: selectedContent }
          ],
        })
      });

      if (!response.ok) throw new Error("智能生成响应异常");
      const data = await response.json();
      setAiResult(data.choices[0].message.content);
    } catch (e) { 
      setAiResult("❌ 重构失败: " + e.message); 
    } finally { 
      setAiLoading(false); 
    }
  }

  // ================= 核心功能 4：随心说直入数据库 (支持公私标签真实入库) =================
  const handleAddQuickNote = async () => {
    if (!quickNote.trim()) return alert("请输入内容");
    setNoteLoading(true);

    try {
      const { error } = await supabase.from('asset_chunks').insert({
        content: quickNote.trim(),
        user_id: session.user.id, // 明确宣告数据主权，防 RLS 拦截
        visibility: quickNoteVisibility // 真实写入公有或私有状态
      });
      if (error) throw error;

      alert(`🎉 已成功作为【${quickNoteVisibility === 'private' ? '私密' : '公开'}】数据存入知识库！`);
      setQuickNote("");
      setIsNoteModalOpen(false);
      handleSearch("", true);
      if (role === 'superadmin') fetchRoleAndStats(session.user.id);
    } catch (e) {
      alert("存入失败: " + e.message);
    } finally {
      setNoteLoading(false);
    }
  }

  const toggleSelection = (id) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(item => item !== id));
    else setSelectedIds([...selectedIds, id]);
  }

  const handleCopyNormal = () => {
    const selectedContent = results
      .filter(item => selectedIds.includes(item.id))
      .map(item => item.content)
      .join('\n\n');
    navigator.clipboard.writeText(selectedContent);
    alert("已复制选中的内容！");
  }

  // 绝对纯净的登录
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert("请输入账号和密码");
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("登录拒绝: 账号或密码错误");
    setAuthLoading(false);
  };

  // ================= 界面渲染区 =================

  // 🟢 极其纯净的登录门禁
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: '20px' }}>
        <div style={{ background: 'white', padding: '40px 24px', borderRadius: '24px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)', textAlign: 'center', width: '100%', maxWidth: '360px', boxSizing: 'border-box' }}>
          <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', width: '72px', height: '72px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 16px rgba(79, 70, 229, 0.2)' }}>
             <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.5px' }}>Brain Vault</h2>
          <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '32px' }}>私有数字资产中枢</p>
          
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleEmailLogin}>
            <input 
              type="email" 
              placeholder="系统账号" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '16px', background: '#f8fafc' }}
            />
            <input 
              type="password" 
              placeholder="访问密码" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '16px', background: '#f8fafc' }}
            />
            <button 
              type="submit"
              disabled={authLoading}
              style={{ width: '100%', background: '#0f172a', color: 'white', padding: '16px', borderRadius: '12px', border: 'none', fontWeight: '600', fontSize: '16px', cursor: authLoading ? 'not-allowed' : 'pointer', marginTop: '8px' }}
            >
              {authLoading ? '验证中...' : '登 录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 🟢 主界面
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: '120px' }}>
      
      {/* 顶部导航 */}
      <header style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '26px', height: '26px', objectFit: 'contain', borderRadius: '6px' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px', margin: 0, lineHeight: 1.2 }}>
              Brain Vault
            </h1>
            {role === 'superadmin' && (
              <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ShieldCheck size={12} /> Super Admin
              </span>
            )}
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '8px' }}>
          <LogOut size={20} strokeWidth={2.5} />
        </button>
      </header>

      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* 超级管理员专属看板与随心记 */}
        {role === 'superadmin' && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{ flex: 1, background: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#EEF2FF', padding: '10px', borderRadius: '12px', color: '#4F46E5' }}>
                <Database size={20} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: '500' }}>记忆资产总数</p>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{stats.totalAssets} <span style={{ fontSize: '14px', fontWeight: '500', color: '#94a3b8' }}>项</span></h3>
              </div>
            </div>
            
            <div 
              onClick={() => setIsNoteModalOpen(true)}
              style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 8px 20px rgba(79, 70, 229, 0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, width: '100px' }}
            >
              <PenLine size={24} style={{ marginBottom: '4px' }} />
              <span style={{ fontSize: '13px', fontWeight: '600' }}>随记入库</span>
            </div>
          </div>
        )}

        {/* 搜索区域 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', width: '100%' }}>
          <div style={{ flex: '1', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
            <input 
              type="text" 
              placeholder="输入关键字 (空格或逗号分隔)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ width: '100%', padding: '16px 40px 16px 48px', borderRadius: '14px', border: 'none', outline: 'none', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', fontWeight: '500', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}
            />
          </div>
          <button 
            onClick={() => handleSearch()} 
            disabled={isSearching}
            style={{ flexShrink: 0, background: '#0f172a', color: 'white', padding: '0 20px', borderRadius: '14px', border: 'none', fontWeight: '600', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
          >
            {isSearching ? <Loader2 size={18} className="animate-spin" /> : '检索'}
          </button>
        </div>

        {/* 沉浸式卡片列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {results.length > 0 ? (
            results.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              
              return (
                <div 
                  key={item.id} 
                  onClick={() => toggleSelection(item.id)}
                  style={{ 
                    background: isSelected ? '#EEF2FF' : 'white', 
                    padding: '20px', 
                    borderRadius: '16px', 
                    border: isSelected ? '2px solid #4F46E5' : '2px solid transparent',
                    boxShadow: isSelected ? '0 4px 12px rgba(79, 70, 229, 0.1)' : '0 2px 8px rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>
                      {isSelected ? <CheckCircle2 size={24} color="#4F46E5" fill="#EEF2FF" /> : <Circle size={24} color="#cbd5e1" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {item._matchScore > 0 && (
                          <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 'bold', background: '#fee2e2', padding: '2px 8px', borderRadius: '10px' }}>
                            命中 {item._matchScore} 次
                          </span>
                        )}
                        
                        {/* 根据数据库真实记录显示公/私标签 */}
                        {item.visibility === 'private' ? (
                          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 'bold', background: '#d1fae5', padding: '2px 8px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Lock size={12} /> 私密数据
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 'bold', background: '#dbeafe', padding: '2px 8px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Globe size={12} /> 公开资源
                          </span>
                        )}
                      </div>
                      <p style={{ color: isSelected ? '#1e1b4b' : '#334155', lineHeight: 1.6, fontSize: '15px', margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {highlightText(item.content)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            !isSearching && hasSearched && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                <FileText size={48} strokeWidth={1} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                <p style={{ fontSize: '16px' }}>未找到匹配的素材</p>
              </div>
            )
          )}
        </div>

        {/* 底部悬浮操作栏 */}
        {selectedIds.length > 0 && (
          <div style={{ 
            position: 'fixed', bottom: '30px', left: '0', right: '0', margin: '0 auto', 
            width: 'calc(100% - 40px)', maxWidth: '450px', 
            background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            color: 'white', padding: '12px 16px', borderRadius: '100px', display: 'flex', 
            alignItems: 'center', justifyContent: 'space-between', 
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)', zIndex: 50
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', paddingLeft: '8px' }}>已选 {selectedIds.length} 项</span>
              <button onClick={() => setSelectedIds([])} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1', padding: '6px 10px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                <Trash2 size={14} /> 清空
              </button>
            </div>
            
            {role === 'superadmin' ? (
              <button 
                onClick={handleReconstruct}
                style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '100px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)' }}
              >
                <Sparkles size={18} /> 生成报告
              </button>
            ) : (
              <button 
                onClick={handleCopyNormal}
                style={{ background: 'white', color: '#0f172a', border: 'none', padding: '10px 20px', borderRadius: '100px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', cursor: 'pointer' }}
              >
                <Copy size={18} /> 复制内容
              </button>
            )}
          </div>
        )}
      </main>

      {/* ================= 新增支持公私设置的随心记模态框 ================= */}
      {isNoteModalOpen && (
        <div 
          onClick={(e) => { if(e.target === e.currentTarget) setIsNoteModalOpen(false) }} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' }}
        >
          <div style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '24px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontWeight: '800', fontSize: '17px', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PenLine size={20} color="#4F46E5" /> 随记入库
              </h3>
              <button onClick={() => setIsNoteModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ padding: '24px', background: '#fafafa' }}>
              
              {/* 权限公私选择 UI */}
              <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '15px', color: quickNoteVisibility === 'private' ? '#10b981' : '#64748b', fontWeight: quickNoteVisibility === 'private' ? 'bold' : 'normal' }}>
                  <input 
                    type="radio" 
                    name="visibility" 
                    value="private" 
                    checked={quickNoteVisibility === 'private'} 
                    onChange={(e) => setQuickNoteVisibility(e.target.value)} 
                    style={{ cursor: 'pointer' }}
                  />
                  <Lock size={16} /> 仅自己可见
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '15px', color: quickNoteVisibility === 'public' ? '#3b82f6' : '#64748b', fontWeight: quickNoteVisibility === 'public' ? 'bold' : 'normal' }}>
                  <input 
                    type="radio" 
                    name="visibility" 
                    value="public" 
                    checked={quickNoteVisibility === 'public'} 
                    onChange={(e) => setQuickNoteVisibility(e.target.value)} 
                    style={{ cursor: 'pointer' }}
                  />
                  <Globe size={16} /> 公开分享
                </label>
              </div>

              <textarea 
                placeholder="在此迅速记下闪念、灵感或私人信息..." 
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                style={{ width: '100%', height: '140px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', resize: 'none', fontSize: '16px', lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ padding: '20px 24px', background: 'white', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setIsNoteModalOpen(false)}
                style={{ flex: 1, background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '12px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
              >
                取消
              </button>
              <button 
                onClick={handleAddQuickNote}
                disabled={noteLoading}
                style={{ flex: 2, background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: noteLoading ? 'not-allowed' : 'pointer' }}
              >
                {noteLoading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />} 
                {noteLoading ? '存入中...' : '存入知识库'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 优化的 AI 结果弹窗 (锁定背景、防漂浮) */}
      {isModalOpen && (
        <div 
          onClick={(e) => { if(e.target === e.currentTarget) setIsModalOpen(false) }} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' }}
        >
          <div style={{ background: 'white', width: '100%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            
            <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setIsModalOpen(false)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#334155', fontWeight: '600' }}>
                  <ArrowLeft size={18} /> 返回
                </button>
                <h3 style={{ fontWeight: '800', fontSize: '17px', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={18} color="#4F46E5" /> 知识融合报告
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', background: '#fafafa' }}>
              {aiLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                  <Loader2 className="animate-spin" style={{ marginBottom: '20px', color: '#4F46E5' }} size={40} />
                  <p style={{ fontWeight: '500' }}>{aiResult}</p>
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.8, color: '#334155', fontSize: '16px', maxWidth: '100%' }}>
                  {aiResult}
                </div>
              )}
            </div>

            {!aiLoading && (
              <div style={{ padding: '20px 24px', background: 'white', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px' }}>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  style={{ flex: 1, background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
                >
                  关闭
                </button>
                <button 
                  onClick={() => { navigator.clipboard.writeText(aiResult); alert("报告已复制！") }}
                  style={{ flex: 2, background: '#0f172a', color: 'white', border: 'none', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <Copy size={20} /> 复制报告内容
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App