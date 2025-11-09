
import React, { useState, useRef, useEffect } from 'react';
import { Send, Upload, Settings, Code, Search, Brain, CheckCircle, Loader, X, Key, Folder, File, Server } from 'lucide-react';

const CodeAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
 
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, processingStage]);

  const parseMarkdown = (text) => {
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-400 hover:underline">$1</a>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
  };

  const formatCode = (text) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', language: match[1] || 'plaintext', content: match[2].trim() });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  };

  const processFiles = async (fileList) => {
    const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.html', '.css', '.json', '.xml', '.md', '.txt', '.yml', '.yaml', '.sh', '.sql', '.r'];
    
    const fileContents = await Promise.all(
      Array.from(fileList)
        .filter(file => {
          const ext = '.' + file.name.split('.').pop().toLowerCase();
          return allowedExtensions.includes(ext) && file.size < 5 * 1024 * 1024;
        })
        .map(async (file) => {
          try {
            const text = await file.text();
            return { 
              name: file.webkitRelativePath || file.name, 
              content: text, 
              size: file.size,
              path: file.webkitRelativePath || file.name
            };
          } catch (error) {
            console.error(`Error reading file ${file.name}:`, error);
            return null;
          }
        })
    );
    
    const validFiles = fileContents.filter(f => f !== null);
    setFiles(prev => [...prev, ...validFiles]);
    
    return validFiles.length;
  };

  const handleFileUpload = async (e) => {
    const uploadedFiles = e.target.files;
    if (uploadedFiles.length > 0) {
      await processFiles(uploadedFiles);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log(e.currentTarget,e.target)
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
console.log("e drop",e)
    const items = e.dataTransfer.items;
    const allFiles = [];

    const traverseDirectory = async (entry) => {
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file((file) => {
            const fullPath = entry.fullPath || file.name;
            Object.defineProperty(file, 'webkitRelativePath', {
              value: fullPath.startsWith('/') ? fullPath.slice(1) : fullPath,
              writable: false
            });
            resolve([file]);
          });
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        return new Promise((resolve) => {
          dirReader.readEntries(async (entries) => {
            const filesPromises = entries.map(e => traverseDirectory(e));
            const filesArrays = await Promise.all(filesPromises);
            resolve(filesArrays.flat());
          });
        });
      }
      return [];
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          const files = await traverseDirectory(entry);
          allFiles.push(...files);
        }
      }
    }

    if (allFiles.length > 0) {
      const count = await processFiles(allFiles);
      if (count > 0) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `✅ Successfully uploaded ${count} file${count > 1 ? 's' : ''}`
        }]);
      }
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setFiles([]);
  };

  const simulateProcessingStages = async (callback) => {
    const stages = [
      { icon: Search, text: 'Analyzing uploaded files...', duration: 800 },
      { icon: Brain, text: 'Processing your request...', duration: 1000 },
      { icon: Code, text: 'Generating response...', duration: 1200 }
    ];

    for (const stage of stages) {
      setProcessingStage(stage.text);
      await new Promise(resolve => setTimeout(resolve, stage.duration));
    }
    
    await callback();
    setProcessingStage('');
  };

  const callBackendAPI = async (userMessage) => {
    const repoContext = files.length > 0 
      ? files.map(f => `// File: ${f.path}\n${f.content.slice(0, 2000)}`).join('\n\n')
      : '';
     const localApiKey = apiKey || localStorage.getItem('geminiApiKey');
     if (!localApiKey) {
      throw new Error('Please set your Gemini API key in settings');
    }
    const response = await fetch(`https://code-assistant-backend.vercel.app/api/code-assist`, {
        // const response = await fetch(`http://localhost:8080/api/code-assist`, {

      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPrompt: userMessage,
        repoContext: repoContext,
        apiKey: apiKey || localApiKey
      })
    });

    if (!response.ok) {
      throw new Error('Backend API request failed');
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.result;
  };


  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;

    const userMessage = {
      role: 'user',
      content: input,
      files: files.length > 0 ? files.map(f => f.path) : null
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      await simulateProcessingStages(async () => {
          const structuredResponse = await callBackendAPI(input);
          setMessages(prev => [...prev, { 
            role: 'model', 
            content: structuredResponse,
            isStructured: true 
          }]);
    
      });
      setFiles([]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: `Error: ${error.message}`,
        isError: true 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const CodeBlock = ({ language, content }) => (
    <div className="my-4 rounded-lg overflow-hidden bg-gray-900 w-[95vw] max-w-[1200px]">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono">{language}</span>
        <button 
          onClick={() => navigator.clipboard.writeText(content)}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Copy
        </button>
      </div>
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm text-gray-100 font-mono">{content}</code>
      </pre>
    </div>
  );

  const StructuredResponse = ({ data }) => (
    <div className="space-y-4">
      {data.explanation && (
        <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg  w-[95vw] max-w-[1200px]">
          <h4 className="text-sm font-semibold text-blue-300 mb-2">💡 Explanation</h4>
          <div 
            className="text-gray-200 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(data.explanation) }}
          />
        </div>
      )}
      
      {data?.code && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <Code className="w-4 h-4" />
            Code ({data?.language || 'plaintext'})
          </h4>
          <CodeBlock language={data?.language || 'plaintext'} content={data?.code} />
        </div>
      )}

      {/* {data.tests && data.tests.length > 0 && (
        <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
          <h4 className="text-sm font-semibold text-green-300 mb-2">🧪 Tests</h4>
          <ul className="space-y-1">
            {data.tests.map((test, idx) => (
              <li key={idx} className="text-sm text-gray-300 font-mono flex items-start gap-2">
                <span className="text-green-400">•</span>
                <span>{test}</span>
              </li>
            ))}
          </ul>
        </div>
      )} */}
    </div>
  );

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'];
    return codeExtensions.includes(ext) ? <Code className="w-4 h-4 text-blue-400" /> : <File className="w-4 h-4 text-gray-400" />;
  };
  return (
    <div 
      className="flex flex-col h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <style>{`
        .inline-code {
          background: rgba(59, 130, 246, 0.1);
          color: #60a5fa;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.9em;
        }
      `}</style>

      {isDragging && (
        <div className="fixed inset-0 bg-blue-600/20 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-gray-800 border-2 border-dashed border-blue-500 rounded-2xl p-12 text-center">
            <Upload className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Drop Files or Folders Here</h3>
            <p className="text-gray-400">Supports multiple files and nested folders</p>
          </div>
        </div>
      )}

      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Code className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI Code Assistant</h1>
            <p className="text-xs text-gray-400">
           ☁️ Powered by Gemini
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Settings className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 bg-linear-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4">
              <Brain className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to AI Code Assistant</h2>
            <p className="text-gray-400 max-w-md mb-4">
              Upload your code files and folders, or drag & drop them anywhere. I'll help you understand, debug, and improve your code.
            </p>
            <div className="flex gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>Click to upload</span>
              </div>
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4" />
                <span>Drag & drop folders</span>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end'  :'justify-center' }`}>
            {msg.role === 'system' ? (
              <div className="bg-green-900/30 border border-green-700/50 text-green-300 px-4 py-2 rounded-lg text-sm">
                {msg.content} 
             
              </div>
            ) : (
              <div className={` rounded-2xl px-6 py-4 ${
                msg.role === 'user' 
                  ? 'bg-linear-to-br from-blue-600 to-blue-700 text-white' 
                  : msg.isError
                  ? 'bg-red-900/50 text-red-200'
                  : 'bg-gray-800 text-gray-100'
              }`}>
                {msg.files && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {msg.files.map((file, i) => (
                      <span key={i} className="text-xs bg-white/20 px-2 py-1 rounded flex items-center gap-1">
                        {getFileIcon(file)}
                        {file}
                      </span>
                    ))}
                  </div>
                )}
                {msg.role === 'model' && !msg.isError ? (
                  msg.isStructured ? (
                    <StructuredResponse data={msg.content} />
                  ) : (
                    <div>
                      {formatCode(msg.content).map((part, i) => (
                        part.type === 'code' ? (
                          <CodeBlock key={i} language={part.language} content={part.content} />
                        ) : (
                          <div 
                            key={i} 
                            className="whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(part.content) }}
                          />
                        )
                      ))}
                    </div>
                  )
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            )}
          </div>
        ))}

        {isProcessing && processingStage && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-6 py-4 flex items-center gap-3">
              <Loader className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-gray-300">{processingStage}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {files.length > 0 && (
        <div className="px-6 py-3 bg-gray-800 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-400">
              {files.length} file{files.length > 1 ? 's' : ''} uploaded
            </span>
            <button
              onClick={clearAllFiles}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg group">
                {getFileIcon(file.name)}
                <span className="text-sm text-gray-300 max-w-xs truncate">{file.path}</span>
                <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
                <button 
                  onClick={() => removeFile(idx)} 
                  className="ml-2 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
        <div className="flex items-end gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            accept=".js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.cs,.php,.rb,.go,.rs,.swift,.kt,.html,.css,.json,.xml,.md,.txt,.yml,.yaml,.sh,.sql,.r"
          />
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="relative">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors group"
              disabled={isProcessing}
              title="Upload files"
            >
              <Upload className="w-5 h-5 text-gray-300" />
            </button>
          </div>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="p-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
            disabled={isProcessing}
            title="Upload folder"
          >
            <Folder className="w-5 h-5 text-gray-300" />
          </button>
          <div className="flex-1 bg-gray-700 rounded-xl px-4 py-3 flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask about your code... (or drag & drop files/folders)"
              className="flex-1 bg-transparent text-white outline-none placeholder-gray-400"
              disabled={isProcessing}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={isProcessing || (!input.trim() && files.length === 0)}
            className="p-3 bg-linear-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 rounded-xl transition-all"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
          
                <div>
                  <label className=" text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Gemini API key"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-2 text-xs text-gray-400">
                    Get your API key from{' '}
                    <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                      Google AI Studio
                    </a>
                  </p>
                </div>

              <button
                onClick={() => {
    localStorage.setItem('geminiApiKey', apiKey);
    setShowSettings(false);
  }}
                className="w-full bg-linear-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white py-3 rounded-lg font-medium transition-all"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeAssistant;