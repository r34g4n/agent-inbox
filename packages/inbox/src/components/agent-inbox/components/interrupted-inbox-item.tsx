import { cn } from "@/lib/utils";
import { HumanInterrupt } from "../types";
import React from "react";
import { prettifyText } from "../utils";
import { InboxItemStatuses } from "./statuses";
import { Thread } from "@langchain/langgraph-sdk";
import NextLink from "next/link";
import { format } from "date-fns";
import { useQueryParams } from "../hooks/use-query-params";

interface InterruptedInboxItem<
  ThreadValues extends Record<string, any> = Record<string, any>,
> {
  threadData: {
    thread: Thread<ThreadValues>;
    status: "interrupted";
    interrupts: HumanInterrupt[];
  };
  isLast: boolean;
}

export function InterruptedInboxItem<
  ThreadValues extends Record<string, any> = Record<string, any>,
>({ threadData, isLast }: InterruptedInboxItem<ThreadValues>) {
  const { updateQueryParams } = useQueryParams();
  const descriptionPreview =
    threadData.interrupts[0].description &&
    threadData.interrupts[0].description.slice(0, 75);
  const descriptionTruncated =
    threadData.interrupts[0].description &&
    threadData.interrupts[0].description.length > 75;

  const updatedAtDateString = format(
    new Date(threadData.thread.updated_at),
    "MM/dd"
  );

  return (
    <div
      onClick={() => updateQueryParams("threadId", threadData.thread.thread_id)}
      className={cn(
        "grid grid-cols-12 w-full p-6 items-center cursor-pointer",
        !isLast &&
          "border-b-[1px] border-gray-200 hover:bg-gray-50/90 transition-colors ease-in-out"
      )}
    >
      <div className="col-span-9 flex items-center justify-start gap-4">
        <div className="w-[6px] h-[6px] rounded-full bg-blue-400" />
        <div className="flex items-center justify-start gap-2">
          <p className="text-black text-sm font-semibold">
            {prettifyText(threadData.interrupts[0].action_request.action)}
          </p>
          {descriptionPreview && (
            <p className="text-sm text-gray-700 font-light">{`${descriptionPreview}${descriptionTruncated ? "..." : ""}`}</p>
          )}
        </div>
      </div>
      <div className="col-span-2">
        <InboxItemStatuses config={threadData.interrupts[0].config} />
      </div>
      <p className="col-span-1 text-gray-600 font-light text-sm">
        {updatedAtDateString}
      </p>
    </div>
  );
}
