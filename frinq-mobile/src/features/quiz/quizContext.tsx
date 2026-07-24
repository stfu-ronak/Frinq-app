import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { QuizMachine, QuizEvent, QuizState } from './domain/quizMachine';
import { QuizDraftRepository } from '../../storage/quizDraftRepository';
import { PartialSaveFn } from './domain/quizMachine';

interface QuizContextValue {
  state: QuizState;
  send: (event: QuizEvent) => void;
  machine: QuizMachine;
  /** Called by QuizStepScreen instead of advancing to a next step once the
   *  last step's answer is recorded — owns finalize-exactly-once + routing
   *  to the processing state. Resolves true on success (boot re-resolves and
   *  unmounts the quiz), false on a finalize failure so the last step can
   *  show an error + retry instead of silently doing nothing. */
  onQuizComplete: () => Promise<boolean>;
}

const QuizContext = createContext<QuizContextValue | null>(null);

export function useQuiz(): QuizContextValue {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz must be used within QuizProvider');
  return ctx;
}

interface Props {
  submissionId: string;
  userId: string;
  repo: QuizDraftRepository;
  partialSave: PartialSaveFn;
  onQuizComplete: () => Promise<boolean>;
  children: React.ReactNode;
}

/** Owns the single QuizMachine instance for the active quiz session and
 *  forces a re-render on every send() (QuizMachine mutates imperatively).
 *  Flushes any pending debounced sync on unmount so backgrounding/navigating
 *  away never silently drops the last edit. */
export function QuizProvider({ submissionId, userId, repo, partialSave, onQuizComplete, children }: Props) {
  const machineRef = useRef<QuizMachine | undefined>(undefined);
  if (!machineRef.current) {
    machineRef.current = QuizMachine.start(submissionId, userId, repo, partialSave);
  }
  const machine = machineRef.current;
  const [state, setState] = useState<QuizState>(machine.getState());

  useEffect(() => {
    return () => {
      machine.flush();
      machine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send(event: QuizEvent) {
    machine.send(event);
    setState(machine.getState());
  }

  return <QuizContext.Provider value={{ state, send, machine, onQuizComplete }}>{children}</QuizContext.Provider>;
}
