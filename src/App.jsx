import { useState, useEffect } from 'react'
import { 
  Search, FileText, LogOut, Sparkles, X, Copy, 
  ShieldCheck, BarChart3, Lock, Mail, Loader2, 
  Users, PenTool 
} from 'lucide-react'
import { supabase } from './supabaseClient'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false) // 新增：搜索中状态
  const [hasSearched, setHasSearched] = useState(false) // 新增：是否搜索过
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
        // 登录后自动触发一次空搜索，展示最新内容
        handleSearch("", true)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchRole(session.user.id)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // 获取用户角色
  const fetchRole = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    if (data) setRole(data.role)
  }

  // 强大的搜索逻辑 (带异常捕获)
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
        // 如果是数据库权限/策略报错，直接弹窗显示！不再装死。
        alert("数据库查询被拒绝或发生错误: \n" + error.message);
        console.error("Supabase Error:", error);
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
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // AI 重构逻辑
  const handleReconstruct = async () => {
    if (role !== 'superadmin') {
      alert("抱歉，由于算力成本高昂，系统仅对超级管理员 (superadmin) 开放 AI 重构。请在数据库 profiles 表中修改您的权限。");
      return;
    }
    
    const selectedContent = results
      .filter(item => selectedIds.includes(item.id))
      .map((item, i) => `【素材${i + 1}】: ${item.content}`)
      .join('\n\n');

    setIsModalOpen(true)
    setAiLoading(true)
    setAiResult("🚀 正在跨时空调取 AI 算力重构知识...")

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) throw new Error("缺失 VITE_GROQ_API_KEY 环境变量，请在 Vercel 中配置。");

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

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error?.message || "AI 响应异常");
      }

      const data = await response.json();
      setAiResult(data.choices[0].message.content);
    } catch (e) { 
      setAiResult("❌ 重构失败: " + e.message); 
    } finally { 
      setAiLoading(false); 
    }
  }

  // 纯净版：仅保留账号密码登录
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert("请输入邮箱和密码");
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("登录失败: " + error.message);
    setAuthLoading(false);
  };

  // ================= 纯净私有化登录界面 =================
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
          <div style={{ background: '#4F46E5', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
             <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>Brain Vault</h2>
          <p style={{ color: '#64748b', marginBottom: '30px' }}>个人数字资产中枢</p>
          
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleEmailLogin}>
            <input 
              type="email" 
              placeholder="管理员邮箱" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box' }}
            />
            <input 
              type="password" 
              placeholder="密码" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box' }}
            />
            
            <button 
              type="submit"
              disabled={authLoading}
              style={{ width: '100%', background: '#4F46E5', color: 'white', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '600', cursor: authLoading ? 'not-allowed' : 'pointer', marginTop: '8px' }}
            >
              {authLoading ? '验证中...' : '安全登录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ================= 主界面 =================
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* 头部导航 */}
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#4F46E5', padding: '6px', borderRadius: '8px', display: 'flex' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b' }}>Brain Vault</h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><LogOut size={20} /></button>
      </header>

      {/* 主内容区 */}
      <main style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={18} />
            <input 
              type="text" 
              placeholder="搜索您的知识资产... (按回车检索)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none' }}
            />
          </div>
          <button 
            onClick={() => handleSearch()} 
            disabled={isSearching}
            style={{ background: '#4F46E5', color: 'white', padding: '0 24px', borderRadius: '10px', border: 'none', fontWeight: '600', cursor: isSearching ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isSearching ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSearching ? '检索中' : '检索'}
          </button>
        </div>

        {/* 搜索结果区域 */}
        <div style={{ display: 'grid', gap: '16px' }}>
          {results.length > 0 ? (
            results.map(item => (
              <div key={item.id} style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(item.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds([...selectedIds, item.id])
                      else setSelectedIds(selectedIds.filter(id => id !== item.id))
                    }}
                    style={{ marginTop: '4px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#334155', lineHeight: 1.6 }}>{item.content}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // 空状态提示
            !isSearching && hasSearched && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                <FileText size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <p>未能找到相关的素材内容</p>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>可能是数据库为空，或您的新账号暂无读取权限</p>
              </div>
            )
          )}
        </div>

        {/* 浮动操作栏 */}
        {selectedIds.length > 0 && (
          <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: 'white', padding: '12px 24px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span>已选 {selectedIds.length} 项</span>
            <button 
              onClick={handleReconstruct}
              style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Sparkles size={16} /> AI 重构
            </button>
          </div>
        )}
      </main>

      {/* AI 结果弹窗 */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '800px', maxHeight: '80vh', borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={18} color="#4F46E5" /> AI 重构报告</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X /></button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#334155' }}>
              {aiLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Loader2 className="animate-spin" style={{ margin: '0 auto 16px', color: '#4F46E5' }} size={32} />
                  <p>{aiResult}</p>
                </div>
              ) : aiResult}
            </div>
            {!aiLoading && (
              <div style={{ padding: '16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
                <button 
                  onClick={() => { navigator.clipboard.writeText(aiResult); alert("已复制到剪贴板！") }}
                  style={{ background: 'white', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  <Copy size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> 复制报告
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