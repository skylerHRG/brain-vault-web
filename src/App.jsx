import { useState, useEffect } from 'react'
import { 
  Search, FileText, LogOut, Sparkles, X, Copy, 
  Loader2 
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState("")
  const [role, setRole] = useState(null)
  
  // 登录表单状态
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // 检查登录状态
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchRole(session.user.id)
        handleSearch("", true) // 登录后自动搜索展示最新内容
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 获取用户角色
  const fetchRole = async (userId) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    if (data) setRole(data.role)
  }

  // 强大的搜索逻辑 (带权限报错提示)
  const handleSearch = async (overrideQuery = null, isInitial = false) => {
    setIsSearching(true)
    const currentQuery = overrideQuery !== null ? overrideQuery : searchQuery;
    
    try {
      const { data, error } = await supabase
        .from('asset_chunks')
        .select('*')
        .ilike('content', `%${currentQuery}%`)
        .limit(20)
      
      if (error) {
        console.error("Supabase Error:", error);
        alert("查询失败，您的账号可能缺少读取权限。\n错误信息: " + error.message);
      } else {
        setResults(data || [])
      }
    } catch (err) {
      alert("网络异常: " + err.message);
    } finally {
      setIsSearching(false)
      if (!isInitial) setHasSearched(true)
    }
  }

  // 键盘回车事件
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  // AI 重构逻辑
  const handleReconstruct = async () => {
    if (role !== 'superadmin') return alert("抱歉，需要 superadmin 权限才能调用 AI。");
    
    const selectedContent = results
      .filter(item => selectedIds.includes(item.id))
      .map((item, i) => `【素材${i + 1}】: ${item.content}`)
      .join('\n\n');

    setIsModalOpen(true)
    setAiLoading(true)
    setAiResult("🚀 正在跨时空调取 AI 算力重构知识...")

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) throw new Error("缺失 VITE_GROQ_API_KEY，请在 Vercel 中配置。");

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`, 
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

      if (!response.ok) throw new Error("AI 响应异常");
      const data = await response.json();
      setAiResult(data.choices[0].message.content);
    } catch (e) { 
      setAiResult("❌ 重构失败: " + e.message); 
    } finally { 
      setAiLoading(false); 
    }
  }

  // 纯粹的账号登录 (彻底无注册)
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert("请输入管理员邮箱和密码");
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("登录拒绝: 账号或密码错误");
    setAuthLoading(false);
  };

  // ================= 极简私有化登录界面 (适配手机) =================
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '20px' }}>
        <div style={{ background: 'white', padding: '40px 24px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'center', width: '100%', maxWidth: '360px', boxSizing: 'border-box' }}>
          <div style={{ background: '#4F46E5', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
             <img src="/logo.png" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>Brain Vault</h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '32px' }}>超级管理员专用入口</p>
          
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleEmailLogin}>
            <input 
              type="email" 
              placeholder="授权邮箱" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontSize: '16px' }}
            />
            <input 
              type="password" 
              placeholder="专属密码" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontSize: '16px' }}
            />
            
            <button 
              type="submit"
              disabled={authLoading}
              style={{ width: '100%', background: '#4F46E5', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontWeight: '600', fontSize: '16px', cursor: authLoading ? 'not-allowed' : 'pointer', marginTop: '8px' }}
            >
              {authLoading ? '验证中...' : '安全进入'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ================= 主界面 (防溢出手机适配版) =================
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* 头部 */}
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#4F46E5', padding: '6px', borderRadius: '8px', display: 'flex' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>Brain Vault</h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#64748b' }}><LogOut size={20} /></button>
      </header>

      {/* 主内容区 */}
      <main style={{ padding: '16px', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* ✨ 修复点：搜索框与按钮的防挤压布局 ✨ */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', width: '100%' }}>
          <div style={{ flex: '1 1 auto', position: 'relative', minWidth: 0 }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={18} />
            <input 
              type="text" 
              placeholder="搜一搜... (回车检索)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ width: '100%', padding: '14px 14px 14px 38px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontSize: '16px' }}
            />
          </div>
          <button 
            onClick={() => handleSearch()} 
            disabled={isSearching}
            style={{ flex: '0 0 auto', background: '#4F46E5', color: 'white', padding: '0 20px', borderRadius: '10px', border: 'none', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '15px' }}
          >
            {isSearching ? '...' : '检索'}
          </button>
        </div>

        {/* 结果列表 */}
        <div style={{ display: 'grid', gap: '12px', paddingBottom: '80px' }}>
          {results.length > 0 ? (
            results.map(item => (
              <div key={item.id} style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxSizing: 'border-box', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(item.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds([...selectedIds, item.id])
                      else setSelectedIds(selectedIds.filter(id => id !== item.id))
                    }}
                    style={{ marginTop: '5px', transform: 'scale(1.2)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#334155', lineHeight: 1.6, fontSize: '15px', margin: 0 }}>{item.content}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            !isSearching && hasSearched && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <p>未找到内容或数据库为空</p>
              </div>
            )
          )}
        </div>

        {/* 底部悬浮操作栏 */}
        {selectedIds.length > 0 && (
          <div style={{ 
            position: 'fixed', bottom: '20px', left: '0', right: '0', margin: '0 auto', 
            width: '90%', maxWidth: '400px', background: '#1e293b', color: 'white', 
            padding: '12px 20px', borderRadius: '50px', display: 'flex', 
            alignItems: 'center', justifyContent: 'space-between', 
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)', boxSizing: 'border-box' 
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500' }}>已选 {selectedIds.length} 项</span>
            <button 
              onClick={handleReconstruct}
              style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}
            >
              <Sparkles size={16} /> AI 重构
            </button>
          </div>
        )}
      </main>

      {/* AI 结果弹窗 */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', width: '100%', height: '85vh', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><Sparkles size={18} color="#4F46E5" /> AI 重构报告</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#334155', fontSize: '15px' }}>
              {aiLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Loader2 className="animate-spin" style={{ margin: '0 auto 16px', color: '#4F46E5' }} size={32} />
                  <p>{aiResult}</p>
                </div>
              ) : aiResult}
            </div>
            {!aiLoading && (
              <div style={{ padding: '16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center' }}>
                <button 
                  onClick={() => { navigator.clipboard.writeText(aiResult); alert("已复制！") }}
                  style={{ width: '100%', background: 'white', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '10px', fontSize: '15px', fontWeight: '500', display: 'flex', justifyContent: 'center', gap: '8px' }}
                >
                  <Copy size={18} /> 复制报告
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