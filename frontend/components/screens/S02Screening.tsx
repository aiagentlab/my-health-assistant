'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import SendIcon from '@mui/icons-material/Send';
import Typography from '@mui/material/Typography';

import ConsultationAppBar from '@/components/ui/ConsultationAppBar';
import ProgressBar from '@/components/ui/ProgressBar';
import ChatBubble from '@/components/chat/ChatBubble';
import TypingIndicator from '@/components/chat/TypingIndicator';
import QuickReply from '@/components/chat/QuickReply';
import EmergencyModal from '@/components/ui/EmergencyModal';
import ExitConfirmModal from '@/components/ui/ExitConfirmModal';
import DisclaimerBanner from '@/components/ui/DisclaimerBanner';
import Toast from '@/components/ui/Toast';
import { sendMessage, resumeConsultation, getDiagnosis } from '@/lib/api/consultation';
import { useClerkToken } from '@/lib/auth/useClerkToken';
import type { SSEChunk } from '@/lib/api/types';
import { useToast } from '@/lib/toast/useToast';

interface ChatMessage {
  role: 'human' | 'ai';
  content: string;
  timestamp: Date;
}

// Quick reply options per phase
const QUICK_REPLY_OPTIONS: Record<number, string[]> = {
  1: ['두통', '복통', '발열', '기침', '피부 발진', '관절 통증', '흉통', '어지러움'],
  2: ['머리', '가슴', '배', '팔/다리', '목/어깨', '허리', '피부', '전신'],
  3: ['오늘 갑자기', '2-3일 전부터', '1주일 전부터', '1개월 이상'],
  4: [],  // Severity slider instead
  5: ['없음', '발열 있음', '구역질', '어지러움', '식욕 저하'],
};

const PHASE_LABELS = ['증상', '부위', '기간', '강도', '추가정보'];

const INITIAL_AI_MESSAGE: ChatMessage = {
  role: 'ai',
  content: '안녕하세요! 건강상담도우미입니다. 😊\n\n어떤 증상으로 상담을 원하시나요? 불편하신 점을 자유롭게 말씀해주세요.',
  timestamp: new Date(),
};

export default function S02ScreeningScreen() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { getAuthToken } = useClerkToken();

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_AI_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isAITyping, setIsAITyping] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyKeywords, setEmergencyKeywords] = useState<string[]>([]);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [sendDisabled, setSendDisabled] = useState(false);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  const [sessionId, setSessionId] = useState('');
  useEffect(() => {
    setSessionId(sessionStorage.getItem('health_session_id') || '');
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAITyping]);

  const handleSend = useCallback(async (text?: string) => {
    const messageText = text || inputValue.trim();
    if (!messageText || isAITyping || sendDisabled) return;

    setInputValue('');
    setSendDisabled(true);

    // Add human message
    const humanMsg: ChatMessage = {
      role: 'human',
      content: messageText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, humanMsg]);
    setIsAITyping(true);

    // Accumulate AI response
    let aiContent = '';
    const aiMsg: ChatMessage = { role: 'ai', content: '', timestamp: new Date() };

    try {
      const token = await getAuthToken() ?? undefined;
      await sendMessage(sessionId, messageText, (chunk: SSEChunk) => {
        if (chunk.error) {
          showToast('서버 오류가 발생했습니다.', 'error');
          return;
        }

        if (chunk.content) {
          aiContent += chunk.content;
          aiMsg.content = aiContent;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'ai' && last.content !== aiContent) {
              return [...prev.slice(0, -1), { ...aiMsg }];
            }
            return [...prev, { ...aiMsg }];
          });
        }

        if (chunk.done) {
          setIsAITyping(false);
          setSendDisabled(false);

          // Check emergency flag
          if (chunk.emergency_flag) {
            setEmergencyOpen(true);
          }

          // Phase progression
          if (chunk.phase && chunk.phase !== 'screening') {
            if (chunk.phase === 'diagnosis') {
              // Pre-fetch diagnosis to avoid race condition with checkpoint persistence
              setDiagnosisLoading(true);
              (async () => {
                try {
                  const diagToken = await getAuthToken() ?? undefined;
                  const result = await getDiagnosis(sessionId, diagToken);
                  sessionStorage.setItem('diagnosis_result', JSON.stringify(result));
                  router.push('/consultation/recommendation');
                } catch {
                  showToast('진단 결과를 불러오지 못했습니다. 다시 시도해주세요.', 'error');
                } finally {
                  setDiagnosisLoading(false);
                }
              })();
            }
          } else if (currentPhase < 5) {
            setCurrentPhase(prev => Math.min(prev + 1, 5));
          }
        }
      }, token);
    } catch (err) {
      setIsAITyping(false);
      setSendDisabled(false);
      showToast('메시지 전송 실패. 다시 시도해주세요.', 'error');
    }
  }, [inputValue, isAITyping, sendDisabled, sessionId, currentPhase, router, showToast]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#F6F8FA', maxWidth: 480, mx: 'auto' }}>
      {/* AppBar */}
      <ConsultationAppBar
        title="AI 문진 상담"
        currentStep={2}
        totalSteps={6}
        onBack={() => setExitConfirmOpen(true)}
      />

      {/* Progress */}
      <ProgressBar
        current={currentPhase}
        total={5}
        stepLabels={PHASE_LABELS}
      />

      {/* Chat Messages */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
          />
        ))}
        {isAITyping && <TypingIndicator />}
        {diagnosisLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 1 }}>
            <Typography variant="body2" color="text.secondary">
              진단 분석 중...
            </Typography>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Quick Replies */}
      <Box sx={{ px: 2 }}>
        <QuickReply
          options={QUICK_REPLY_OPTIONS[currentPhase] || []}
          onSelect={(option) => handleSend(option)}
          disabled={isAITyping}
        />
      </Box>

      {/* Disclaimer */}
      <Box sx={{ px: 2, mb: 1 }}>
        <DisclaimerBanner />
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: 'white',
          borderTop: '1px solid #E2E8EE',
          display: 'flex',
          gap: 1,
          alignItems: 'flex-end',
        }}
      >
        <TextField
          inputRef={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="증상을 자유롭게 입력해주세요..."
          multiline
          maxRows={3}
          fullWidth
          disabled={isAITyping}
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: '#F6F8FA',
              '& fieldset': { borderColor: '#E2E8EE' },
              '&:hover fieldset': { borderColor: '#1B6B5A' },
              '&.Mui-focused fieldset': { borderColor: '#1B6B5A' },
            },
          }}
        />
        <IconButton
          onClick={() => handleSend()}
          disabled={!inputValue.trim() || isAITyping}
          sx={{
            bgcolor: inputValue.trim() && !isAITyping ? '#1B6B5A' : '#E2E8EE',
            color: inputValue.trim() && !isAITyping ? 'white' : '#6B7D8E',
            width: 44,
            height: 44,
            flexShrink: 0,
            '&:hover': { bgcolor: '#155548' },
            '&.Mui-disabled': { bgcolor: '#E2E8EE', color: '#6B7D8E' },
          }}
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Emergency Modal */}
      <EmergencyModal
        open={emergencyOpen}
        keywords={emergencyKeywords}
        onCall119={async () => {
          setEmergencyOpen(false);
          try {
            const token = await getAuthToken() ?? undefined;
            await resumeConsultation(sessionId, 'call_119', token);
            router.push('/consultation/summary');
          } catch {
            showToast('응급 처리 중 오류가 발생했습니다.', 'error');
          }
        }}
        onContinue={async () => {
          setEmergencyOpen(false);
          try {
            const token = await getAuthToken() ?? undefined;
            await resumeConsultation(sessionId, 'continue_consultation', token);
          } catch {
            showToast('상담 재개 중 오류가 발생했습니다.', 'error');
          }
        }}
      />

      {/* Exit Confirm */}
      <ExitConfirmModal
        open={exitConfirmOpen}
        onConfirm={() => {
          sessionStorage.removeItem('health_session_id');
          router.push('/consultation/onboarding');
        }}
        onCancel={() => setExitConfirmOpen(false)}
      />

      {/* Toast */}
      <Toast
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={hideToast}
      />
    </Box>
  );
}
