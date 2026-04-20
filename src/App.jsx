import { useState, useEffect } from 'react'
import { 
  Search, LogOut, Sparkles, X, Copy, 
  Loader2, CheckCircle2, Circle, FileText
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
  
  // 登录表单状态
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // 1. 检查登录状态
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) handleSearch("", true) // 登录后自动展示最新内容
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ================= 核心功能 1：多词条智能搜索与排序 =================
  const handleSearch = async (overrideQuery = null, isInitial = false) => {
    setIsSearching(true)
    const currentQuery = overrideQuery !== null ? overrideQuery : searchQuery;
    
    // 解析关键字：支持空格和逗号分隔，过滤空词
    const keywords = currentQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');

    try {
      let query = supabase.from('asset_chunks').select('*').limit(100);
      
      // 如果有关键字，构建 OR 查询逻辑以扩大命中面
      if (keywords.length > 0) {
        const orString = keywords.map(kw => `content.ilike.%${kw}%`).join(',');
        query = query.or(orString);
      } else {
        query = query.order('created_at', { ascending: false }).limit(30);
      }

      const { data, error } = await query;
      if (error) throw error;

      let processedData = data || [];

      // 如果有关键字，在前端进行精确打分与排序 (出现次数越多越靠前)
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
        // 按匹配度降序排序
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

  // 回车键触发搜索
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }

  // ================= 核心功能 2：关键字黄色高亮渲染器 =================
  const highlightText = (text) => {
    const keywords = searchQuery.split(/[\s,，]+/).filter(k => k.trim() !== '');
    if (keywords.length === 0) return text;

    // 安全转义正则表达式字符
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

  // ================= 核心功能 3：AI 重构逻辑 =================
  const handleReconstruct = async () => {
    const selectedContent = results
      .filter(item => selectedIds.includes(item.id))
      .map((item, i) => `【素材${i + 1}】: ${item.content}`)
      .join('\n\n');

    setIsModalOpen(true)
    setAiLoading(true)
    setAiResult("🚀 正在唤醒 Llama 3.3 70B 模型重构知识，请稍候...")

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
          model: "llama-3.3-70b-versatile", // 确认使用最新模型
          messages: [
            { role: "system", content: "你是一个资深知识主编，请将素材进行语义去重并重构为逻辑连贯的Markdown报告。要求：保留专业术语，去除废话，排版清晰美观。" },
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

  // 核心功能 4：卡片点击多选切换逻辑
  const toggleSelection = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(item => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  // 核心功能 1（入口）：纯粹的管理员密码登录
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
          <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.5px' }}>Brain Vault <span style={{ fontSize: '12px', color: '#4F46E5', verticalAlign: 'middle' }}>v2.0</span></h2>
          <p style={{ color: '#64748b', fontSize: '15px', marginBottom: '32px' }}>私有数字资产中枢</p>
          
          <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={handleEmailLogin}>
            <input 
              type="email" 
              placeholder="管理员账号 (Email)" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '16px', background: '#f8fafc', transition: 'all 0.2s' }}
            />
            <input 
              type="password" 
              placeholder="访问密码" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontSize: '16px', background: '#f8fafc', transition: 'all 0.2s' }}
            />
            
            <button 
              type="submit"
              disabled={authLoading}
              style={{ width: '100%', background: '#0f172a', color: 'white', padding: '16px', borderRadius: '12px', border: 'none', fontWeight: '600', fontSize: '16px', cursor: authLoading ? 'not-allowed' : 'pointer', marginTop: '8px', transition: 'background 0.2s' }}
            >
              {authLoading ? '验证中...' : '登 录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 🟢 沉浸式主界面
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: '100px' }}>
      
      {/* 顶部导航 */}
      <header style={{ background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '26px', height: '26px', objectFit: 'contain', borderRadius: '6px' }} />
          <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px', margin: 0 }}>
            Brain Vault <span style={{ fontSize: '12px', color: '#4F46E5', fontWeight: 'bold' }}>纯净版</span>
          </h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '8px' }}>
          <LogOut size={20} strokeWidth={2.5} />
        </button>
      </header>

      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* 清晰明了的搜索区域 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', width: '100%' }}>
          <div style={{ flex: '1', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
            <input 
              type="text" 
              placeholder="多个关键字请用空格或逗号隔开..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ width: '100%', padding: '16px 40px 16px 48px', borderRadius: '14px', border: '2px solid transparent', outline: 'none', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', fontWeight: '500', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}
            />
          </div>
          <button 
            onClick={() => handleSearch()} 
            disabled={isSearching}
            style={{ flexShrink: 0, background: '#4F46E5', color: 'white', padding: '0 24px', borderRadius: '14px', border: 'none', fontWeight: '600', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.3)' }}
          >
            {isSearching ? <Loader2 size={18} className="animate-spin" /> : '搜索'}
          </button>
        </div>

        {/* 排序与高亮的沉浸式卡片列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {results.length > 0 ? (
            results.map((item, index) => {
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
                    transition: 'all 0.15s ease',
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    {/* 复选框图标：随点击自动切换 */}
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>
                      {isSelected ? (
                        <CheckCircle2 size={24} color="#4F46E5" fill="#EEF2FF" />
                      ) : (
                        <Circle size={24} color="#cbd5e1" />
                      )}
                    </div>
                    {/* 高亮渲染的内容区 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {item._matchScore > 0 && (
                        <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 'bold', background: '#fee2e2', padding: '2px 8px', borderRadius: '10px', marginBottom: '8px', display: 'inline-block' }}>
                          匹配度: {item._matchScore}
                        </span>
                      )}
                      <p style={{ color: isSelected ? '#1e1b4b' : '#334155', lineHeight: 1.6, fontSize: '15px', margin: 0, wordBreak: 'break-word' }}>
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

        {/* 悬浮多选操作栏 */}
        {selectedIds.length > 0 && (
          <div style={{ 
            position: 'fixed', bottom: '30px', left: '0', right: '0', margin: '0 auto', 
            width: 'calc(100% - 40px)', maxWidth: '400px', 
            background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            color: 'white', padding: '12px 16px 12px 24px', borderRadius: '100px', display: 'flex', 
            alignItems: 'center', justifyContent: 'space-between', 
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)', zIndex: 50
          }}>
            <span style={{ fontSize: '15px', fontWeight: '600' }}>已选中 {selectedIds.length} 项</span>
            <button 
              onClick={handleReconstruct}
              style={{ background: '#4F46E5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '100px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)' }}
            >
              <Sparkles size={18} /> AI 提炼
            </button>
          </div>
        )}
      </main>

      {/* AI 结果弹窗 */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '800px', height: '88vh', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' }}>
            
            <div style={{ padding: '24px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', color: '#0f172a' }}>
                <Sparkles size={22} color="#4F46E5" fill="#EEF2FF" /> Llama 3.3 知识重构
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#334155', fontSize: '16px' }}>
              {aiLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                  <Loader2 className="animate-spin" style={{ marginBottom: '20px', color: '#4F46E5' }} size={40} />
                  <p style={{ fontWeight: '500' }}>{aiResult}</p>
                </div>
              ) : aiResult}
            </div>

            {!aiLoading && (
              <div style={{ padding: '20px 24px 30px', background: 'linear-gradient(to top, white 80%, rgba(255,255,255,0))', borderTop: '1px solid #f1f5f9' }}>
                <button 
                  onClick={() => { navigator.clipboard.writeText(aiResult); alert("报告已复制！") }}
                  style={{ width: '100%', background: '#0f172a', color: 'white', border: 'none', padding: '16px', borderRadius: '16px', fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 8px 16px rgba(15, 23, 42, 0.15)' }}
                >
                  <Copy size={20} /> 复制 Markdown 报告
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