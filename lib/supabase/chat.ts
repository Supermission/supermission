/**
 * Chat Persistence Functions
 * Save and load chat messages and sessions from Supabase
 */

import { supabaseAdmin } from './client';
import type { Message } from '@/lib/store/chat';

/**
 * Session management
 */

export interface ChatSession {
  session_id: string;
  user_address: string;
  agent_id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
}

export async function createSession(session: Omit<ChatSession, 'created_at' | 'updated_at'>) {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .insert([session])
    .select()
    .single();

  if (error) throw error;
  return data as ChatSession;
}

export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data as ChatSession;
}

export async function updateSession(sessionId: string, updates: Partial<ChatSession>) {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .update(updates)
    .eq('session_id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data as ChatSession;
}

export async function getSessionsByWallet(walletAddress: string, limit: number = 50): Promise<ChatSession[]> {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('*')
    .eq('user_address', walletAddress.toLowerCase())
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return data as ChatSession[];
}

/**
 * Message management
 */

export interface ChatMessage {
  id?: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: unknown;
  created_at?: string;
}

export async function ensureSessionExists(sessionId: string, walletAddress: string, title?: string, agentId?: string) {
  const sessionData: Record<string, string> = {
    session_id: sessionId,
    user_address: walletAddress.toLowerCase(),
    agent_id: agentId || 'supermission-agent',
  };
  if (title) sessionData.title = title;

  const { error } = await supabaseAdmin
    .from('chat_sessions')
    .upsert(sessionData, { onConflict: 'session_id' });

  if (error) throw error;
}

export async function deleteSessionWithMessages(sessionId: string) {
  // Messages are cascade-deleted due to FK constraint
  const { error } = await supabaseAdmin
    .from('chat_sessions')
    .delete()
    .eq('session_id', sessionId);

  if (error) throw error;
}

export async function saveMessage(
  message: Omit<ChatMessage, 'id' | 'created_at'>
) {
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .insert([message])
    .select()
    .single();

  if (error) throw error;
  return data as ChatMessage;
}


export async function deleteMessagesFromTimestamp(sessionId: string, fromTimestampIso: string) {
  const { error } = await supabaseAdmin
    .from('chat_messages')
    .delete()
    .eq('session_id', sessionId)
    .gte('created_at', fromTimestampIso);

  if (error) throw error;
}

export async function getMessages(sessionId: string, limit: number = 100): Promise<ChatMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data as ChatMessage[];
}

/**
 * Convert between Supabase format and app format
 */

export function toAppMessage(dbMessage: ChatMessage): Message {
  return {
    id: dbMessage.id || `msg_${Date.now()}`,
    role: dbMessage.role,
    content: dbMessage.content,
    timestamp: dbMessage.created_at ? new Date(dbMessage.created_at).getTime() : Date.now(),
    metadata: dbMessage.metadata as Message['metadata'],
  };
}

export function toDbMessage(appMessage: Omit<Message, 'id' | 'timestamp'>, sessionId: string): Omit<ChatMessage, 'id' | 'created_at'> {
  return {
    session_id: sessionId,
    role: appMessage.role,
    content: appMessage.content,
    metadata: appMessage.metadata,
  };
}
