"use client";

import {
  AgentInbox,
  HumanInterrupt,
  HumanResponse,
  ThreadData,
  ThreadStatusWithAll,
} from "@/components/agent-inbox/types";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/client";
import {
  Run,
  Thread,
  ThreadState,
  ThreadStatus,
} from "@langchain/langgraph-sdk";
import { END } from "@langchain/langgraph/web";
import React from "react";
import { useQueryParams } from "../hooks/use-query-params";
import {
  INBOX_PARAM,
  LIMIT_PARAM,
  OFFSET_PARAM,
  GRAPH_ID_LOCAL_STORAGE_KEY,
  AGENT_INBOX_PARAM,
  AGENT_INBOXES_LOCAL_STORAGE_KEY,
} from "../constants";
import {
  getInterruptFromThread,
  processInterruptedThread,
  processThreadWithoutInterrupts,
} from "./utils";
import { useLocalStorage } from "../hooks/use-local-storage";

type ThreadContentType<
  ThreadValues extends Record<string, any> = Record<string, any>,
> = {
  loading: boolean;
  threadData: ThreadData<ThreadValues>[];
  hasMoreThreads: boolean;
  agentInboxes: AgentInbox[];
  addAgentInbox: (agentInbox: AgentInbox) => void;
  ignoreThread: (threadId: string) => Promise<void>;
  fetchThreads: (inbox: ThreadStatusWithAll) => Promise<void>;
  sendHumanResponse: <TStream extends boolean = false>(
    threadId: string,
    response: HumanResponse[],
    options?: {
      stream?: TStream;
    }
  ) => TStream extends true
    ?
        | AsyncGenerator<{
            event: Record<string, any>;
            data: any;
          }>
        | undefined
    : Promise<Run> | undefined;
  fetchSingleThread: (threadId: string) => Promise<{
    thread: Thread<ThreadValues>;
    status: ThreadStatus;
    interrupts: HumanInterrupt[] | undefined;
  }>;
};

const ThreadsContext = React.createContext<ThreadContentType | undefined>(
  undefined
);

export function ThreadsProvider<
  ThreadValues extends Record<string, any> = Record<string, any>,
>({ children }: { children: React.ReactNode }) {
  const { getSearchParam, searchParams, updateQueryParams } = useQueryParams();
  const { getItem, setItem } = useLocalStorage();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [threadData, setThreadData] = React.useState<
    ThreadData<ThreadValues>[]
  >([]);
  const [hasMoreThreads, setHasMoreThreads] = React.useState(true);
  const [agentInboxes, setAgentInboxes] = React.useState<AgentInbox[]>([]);

  const limitParam = searchParams.get(LIMIT_PARAM);
  const offsetParam = searchParams.get(OFFSET_PARAM);
  const inboxParam = searchParams.get(INBOX_PARAM);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const inboxSearchParam = getSearchParam(INBOX_PARAM) as ThreadStatusWithAll;
    if (!inboxSearchParam) {
      return;
    }
    fetchThreads(inboxSearchParam);
  }, [limitParam, offsetParam, inboxParam]);

  const agentInboxParam = searchParams.get(AGENT_INBOX_PARAM);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    getAgentInboxes();
  }, [agentInboxParam]);

  const getAgentInboxes = React.useCallback(async () => {
    const agentInboxSearchParam = getSearchParam(AGENT_INBOX_PARAM);
    const agentInboxes = getItem(AGENT_INBOXES_LOCAL_STORAGE_KEY);
    if (!agentInboxes || !agentInboxes.length) {
      toast({
        title: "Error",
        description: "Agent inbox not found. Please add an inbox in settings.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    let parsedAgentInboxes: AgentInbox[] = [];
    try {
      parsedAgentInboxes = JSON.parse(agentInboxes);
    } catch (error) {
      console.error("Error parsing agent inboxes", error);
      toast({
        title: "Error",
        description: "Agent inbox not found. Please add an inbox in settings.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (!agentInboxSearchParam) {
      const selectedInbox = parsedAgentInboxes.find((i) => i.selected);
      if (!selectedInbox) {
        parsedAgentInboxes[0].selected = true;
        updateQueryParams(AGENT_INBOX_PARAM, parsedAgentInboxes[0].graphId);
        setAgentInboxes(parsedAgentInboxes);
        setItem(
          AGENT_INBOXES_LOCAL_STORAGE_KEY,
          JSON.stringify(parsedAgentInboxes)
        );
      } else {
        updateQueryParams(AGENT_INBOX_PARAM, selectedInbox.graphId);
        setAgentInboxes(parsedAgentInboxes);
        setItem(
          AGENT_INBOXES_LOCAL_STORAGE_KEY,
          JSON.stringify(parsedAgentInboxes)
        );
      }
      return;
    }

    const selectedInbox = parsedAgentInboxes.find(
      (i) => i.graphId === agentInboxSearchParam
    );
    if (!selectedInbox) {
      toast({
        title: "Error",
        description: "Agent inbox not found. Please add an inbox in settings.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    parsedAgentInboxes = parsedAgentInboxes.map((i) => {
      if (i.graphId === agentInboxSearchParam) {
        i.selected = true;
      }
      return i;
    });
    setAgentInboxes(parsedAgentInboxes);
    setItem(
      AGENT_INBOXES_LOCAL_STORAGE_KEY,
      JSON.stringify(parsedAgentInboxes)
    );
  }, []);

  const addAgentInbox = React.useCallback((agentInbox: AgentInbox) => {
    const agentInboxes = getItem(AGENT_INBOXES_LOCAL_STORAGE_KEY);
    if (!agentInboxes || !agentInboxes.length) {
      setAgentInboxes([agentInbox]);
      setItem(AGENT_INBOXES_LOCAL_STORAGE_KEY, JSON.stringify([agentInbox]));
      updateQueryParams(AGENT_INBOX_PARAM, agentInbox.graphId);
      return;
    }
    const parsedAgentInboxes = JSON.parse(agentInboxes);
    parsedAgentInboxes.push(agentInbox);
    setAgentInboxes(parsedAgentInboxes);
    setItem(
      AGENT_INBOXES_LOCAL_STORAGE_KEY,
      JSON.stringify(parsedAgentInboxes)
    );
    updateQueryParams(AGENT_INBOX_PARAM, agentInbox.graphId);
  }, []);

  const fetchThreads = React.useCallback(async (inbox: ThreadStatusWithAll) => {
    setLoading(true);
    const client = createClient();

    try {
      const limitQueryParam = getSearchParam(LIMIT_PARAM);
      if (!limitQueryParam) {
        throw new Error("Limit query param not found");
      }
      const offsetQueryParam = getSearchParam(OFFSET_PARAM);
      if (!offsetQueryParam) {
        throw new Error("Offset query param not found");
      }
      const limit = Number(limitQueryParam);
      const offset = Number(offsetQueryParam);

      if (limit > 100) {
        toast({
          title: "Error",
          description: "Cannot fetch more than 100 threads at a time",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      const statusInput = inbox === "all" ? {} : { status: inbox };

      const threadSearchArgs = {
        offset,
        limit,
        ...statusInput,
      };
      const threads = await client.threads.search(threadSearchArgs);
      const data: ThreadData<ThreadValues>[] = [];

      if (["interrupted", "all"].includes(inbox)) {
        const interruptedThreads = threads.filter(
          (t) => t.status === "interrupted"
        );

        // Process threads with interrupts in their thread object
        const processedThreads = interruptedThreads
          .map((t) => processInterruptedThread(t as Thread<ThreadValues>))
          .filter((t): t is ThreadData<ThreadValues> => !!t);
        data.push(...processedThreads);

        // [LEGACY]: Process threads that need state lookup
        const threadsWithoutInterrupts = interruptedThreads.filter(
          (t) => !getInterruptFromThread(t)?.length
        );

        if (threadsWithoutInterrupts.length > 0) {
          const states = await bulkGetThreadStates(
            threadsWithoutInterrupts.map((t) => t.thread_id)
          );

          const interruptedData = states.map((state) => {
            const thread = threadsWithoutInterrupts.find(
              (t) => t.thread_id === state.thread_id
            );
            if (!thread) {
              throw new Error(`Thread not found: ${state.thread_id}`);
            }
            return processThreadWithoutInterrupts(
              thread as Thread<ThreadValues>,
              state
            );
          });

          data.push(...interruptedData);
        }
      }

      threads.forEach((t) => {
        if (t.status === "interrupted") {
          return;
        }
        data.push({
          status: t.status,
          thread: t as Thread<ThreadValues>,
        });
      });

      // Sort data by created_at in descending order (most recent first)
      const sortedData = data.sort((a, b) => {
        return (
          new Date(b.thread.created_at).getTime() -
          new Date(a.thread.created_at).getTime()
        );
      });

      setThreadData(sortedData);
      setHasMoreThreads(threads.length === limit);
    } catch (e) {
      console.error("Failed to fetch threads", e);
    }
    setLoading(false);
  }, []);

  const fetchSingleThread = React.useCallback(async (threadId: string) => {
    const client = createClient();
    const thread = await client.threads.get(threadId);
    let threadInterrupts: HumanInterrupt[] | undefined;
    if (thread.status === "interrupted") {
      threadInterrupts = getInterruptFromThread(thread);
      if (!threadInterrupts || !threadInterrupts.length) {
        const state = await client.threads.getState(threadId);
        const { interrupts } = processThreadWithoutInterrupts(thread, {
          thread_state: state,
          thread_id: threadId,
        });
        threadInterrupts = interrupts;
      }
    }
    return {
      thread,
      status: thread.status,
      interrupts: threadInterrupts,
    };
  }, []);

  const bulkGetThreadStates = React.useCallback(
    async (
      threadIds: string[]
    ): Promise<
      { thread_id: string; thread_state: ThreadState<ThreadValues> }[]
    > => {
      const client = createClient();
      const chunkSize = 25;
      const chunks = [];

      // Split threadIds into chunks of 25
      for (let i = 0; i < threadIds.length; i += chunkSize) {
        chunks.push(threadIds.slice(i, i + chunkSize));
      }

      // Process each chunk sequentially
      const results: {
        thread_id: string;
        thread_state: ThreadState<ThreadValues>;
      }[] = [];
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(async (id) => ({
            thread_id: id,
            thread_state: await client.threads.getState<ThreadValues>(id),
          }))
        );
        results.push(...chunkResults);
      }

      return results;
    },
    []
  );

  const ignoreThread = async (threadId: string) => {
    const client = createClient();
    try {
      await client.threads.updateState(threadId, {
        values: null,
        asNode: END,
      });

      setThreadData((prev) => {
        return prev.filter((p) => p.thread.thread_id !== threadId);
      });
      toast({
        title: "Success",
        description: "Ignored thread",
        duration: 3000,
      });
    } catch (e) {
      console.error("Error ignoring thread", e);
      toast({
        title: "Error",
        description: "Failed to ignore thread",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const sendHumanResponse = <TStream extends boolean = false>(
    threadId: string,
    response: HumanResponse[],
    options?: {
      stream?: TStream;
    }
  ): TStream extends true
    ?
        | AsyncGenerator<{
            event: Record<string, any>;
            data: any;
          }>
        | undefined
    : Promise<Run> | undefined => {
    const graphId = getItem(GRAPH_ID_LOCAL_STORAGE_KEY);
    if (!graphId) {
      toast({
        title: "No graph ID found.",
        description:
          "Graph IDs are required to send responses. Please add a graph ID in the settings.",
        variant: "destructive",
      });
      return undefined;
    }

    const client = createClient();
    try {
      if (options?.stream) {
        return client.runs.stream(threadId, graphId, {
          command: {
            resume: response,
          },
          streamMode: "events",
        }) as any; // Type assertion needed due to conditional return type
      }
      return client.runs.create(threadId, graphId, {
        command: {
          resume: response,
        },
      }) as any; // Type assertion needed due to conditional return type
    } catch (e: any) {
      console.error("Error sending human response", e);
      throw e;
    }
  };

  const contextValue: ThreadContentType = {
    loading,
    threadData,
    hasMoreThreads,
    agentInboxes,
    addAgentInbox,
    ignoreThread,
    sendHumanResponse,
    fetchThreads,
    fetchSingleThread,
  };

  return (
    <ThreadsContext.Provider value={contextValue}>
      {children}
    </ThreadsContext.Provider>
  );
}

export function useThreadsContext<
  T extends Record<string, any> = Record<string, any>,
>() {
  const context = React.useContext(ThreadsContext) as ThreadContentType<T>;
  if (context === undefined) {
    throw new Error("useThreadsContext must be used within a ThreadsProvider");
  }
  return context;
}
