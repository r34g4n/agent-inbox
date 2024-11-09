"use client";

import { Row, flexRender } from "@tanstack/react-table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ActionType, ThreadInterruptData } from "../types";
import { TableCell, TableRow } from "@/components/ui/table";
import React, { useState } from "react";
import { AddEventComponent } from "./add-event";
import { EditEventComponent } from "./edit-event";
import { NotifyEventComponent } from "./notify-event";
import { useThreadsContext } from "@/contexts/ThreadContext";
import { ThreadHistory } from "./thread-history";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToFromEmails } from "./to-from-emails";

interface EmailSheetProps {
  row: Row<ThreadInterruptData>;
  excludeSelector?: string;
}

export function EmailSheetComponent({ row, excludeSelector }: EmailSheetProps) {
  const { updateState, ignoreThread } = useThreadsContext();
  const [open, setOpen] = useState(false);

  const {
    interrupt_value: interruptValue,
    thread_id: threadId,
    thread,
  } = row.original;

  const handleTableRowClick = (
    e: React.MouseEvent<HTMLTableRowElement, MouseEvent>
  ) => {
    e.preventDefault();
    // Check if the click occurred within the dropdown menu
    if (
      excludeSelector &&
      document.querySelector(excludeSelector)?.contains(e.target as Node)
    ) {
      return; // Don't open sheet if clicking within dropdown
    }
    setOpen(true);
  };

  const handleSubmitAddEvent = async (addValues: Record<string, any>) => {
    setOpen(false);
    await updateState(threadId, addValues, "human_node");
  };

  const handleSubmitEditEvent = async (addValues: Record<string, any>) => {
    setOpen(false);
    await updateState(threadId, addValues, "human_node");
  };

  const handleSubmitIgnoreEvent = async (threadId: string) => {
    setOpen(false);
    await ignoreThread(threadId);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <TableRow
          data-state={row.getIsSelected() && "selected"}
          onClick={handleTableRowClick}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex flex-col h-full min-w-[70vw] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
        aria-describedby={undefined}
      >
        <SheetHeader>
          <SheetTitle className="text-xl">
            {thread.values.email.subject}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4">
          <ToFromEmails
            fromEmailText={thread.values.email.from_email}
            toEmailText={thread.values.email.to_email}
          />

          <hr />

          <ThreadHistory threadValues={thread.values} />

          <hr />

          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="text-sm leading-5">{children}</p>
              ),
            }}
          >
            {thread.values.email.page_content}
          </Markdown>

          <hr />

          {interruptValue?.type === ActionType.ADD && (
            <AddEventComponent
              event={interruptValue}
              threadId={threadId}
              handleSubmit={handleSubmitAddEvent}
              handleIgnore={handleSubmitIgnoreEvent}
            />
          )}
          {interruptValue?.type === ActionType.EDIT && (
            <EditEventComponent
              event={interruptValue}
              threadId={threadId}
              handleSubmit={handleSubmitEditEvent}
              handleIgnore={handleSubmitIgnoreEvent}
            />
          )}
          {interruptValue?.type === ActionType.NOTIFY && (
            <NotifyEventComponent event={interruptValue} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const EmailSheet = React.memo(EmailSheetComponent);
