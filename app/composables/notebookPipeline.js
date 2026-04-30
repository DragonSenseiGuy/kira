/**
 * @file notebookPipeline.js
 * @description Background pipeline for maintaining the Notebook memory system.
 * 
 * The pipeline runs asynchronously and consists of three stages:
 * 1. Summarization - Summarize chats that need it (parallel, cheap model)
 * 2. Consolidation - Integrate summaries into Notebook (single call, capable model)
 * 3. Atomic Swap - Write new Notebook only after validation
 */

import localforage from "localforage";
import { getSessionToken } from "~/composables/useSession";
import {
  loadNotebook,
  saveNotebook,
  validateNotebook
} from "./notebook";
import {
  getChatsNeedingSummary,
  processChatSummaries,
  getSummariesForNotebook
} from "./chatSummarizer";

const PIPELINE_STATE_KEY = "notebook_pipeline_state";

/**
 * Loads the current pipeline state
 * @returns {Promise<Object>} Pipeline state
 */
async function loadPipelineState() {
  try {
    return await localforage.getItem(PIPELINE_STATE_KEY) || {
      lastRun: null,
      status: "idle",
      stage: 0,
      lastError: null
    };
  } catch {
    return { lastRun: null, status: "idle", stage: 0, lastError: null };
  }
}

/**
 * Saves pipeline state
 * @param {Object} state - Pipeline state
 */
async function savePipelineState(state) {
  try {
    await localforage.setItem(PIPELINE_STATE_KEY, state);
  } catch (error) {
    console.error("Error saving pipeline state:", error);
  }
}

/**
 * Checks if there are "orphaned" summaries - summaries that were created but never
 * incorporated into the Notebook (due to pipeline interruption after stage 1)
 * @returns {Promise<boolean>} True if there are orphaned summaries
 */
async function hasOrphanedSummaries() {
  try {
    const [notebookMetadata, metadata] = await Promise.all([
      localforage.getItem("user_notebook_metadata"),
      localforage.getItem("conversations_metadata")
    ]);

    const lastConsolidation = notebookMetadata?.lastConsolidatedAt;
    if (!lastConsolidation) return false;

    // Check if any summaries exist that are newer than last consolidation
    for (const conv of metadata || []) {
      const summary = await localforage.getItem(`chat_summary_${conv.id}`);
      if (summary?.lastSummarizedAt && !summary.incorporatedAt) {
        // Summary exists and hasn't been incorporated
        if (new Date(summary.lastSummarizedAt) > new Date(lastConsolidation)) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.error("Error checking for orphaned summaries:", error);
    return false;
  }
}

/**
 * Checks if the pipeline should run based on triggers
 * @returns {Promise<{shouldRun: boolean, reason?: string}>}
 */
export async function shouldRunPipeline() {
  try {
    const [notebook, chatsNeedingSummary, summariesForNotebook] = await Promise.all([
      loadNotebook(),
      getChatsNeedingSummary(),
      getSummariesForNotebook()
    ]);

    const lastUpdate = new Date(notebook.metadata.lastUpdated);
    const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    const daysSinceUpdate = hoursSinceUpdate / 24;

    // Trigger 1: More than 5 chats have new content
    if (chatsNeedingSummary.length >= 5) {
      return {
        shouldRun: true,
        reason: `${chatsNeedingSummary.length} chats need summarization`
      };
    }

    // Trigger 2: More than 24 hours passed with some new content
    if (daysSinceUpdate >= 1 && summariesForNotebook.length > 0) {
      return {
        shouldRun: true,
        reason: `${daysSinceUpdate.toFixed(1)} days since last update with ${summariesForNotebook.length} new summaries`
      };
    }

    // Trigger 3: More than 48 hours passed (maintenance run)
    if (daysSinceUpdate >= 2) {
      return {
        shouldRun: true,
        reason: `Maintenance run - ${daysSinceUpdate.toFixed(1)} days since last update`
      };
    }

    return { shouldRun: false };
  } catch (error) {
    console.error("Error checking pipeline triggers:", error);
    return { shouldRun: false };
  }
}

/**
 * Runs the complete Notebook pipeline
 * This is the main entry point - call this when app opens
 * Handles resumption if the pipeline was interrupted
 * 
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} Pipeline result
 */
export async function runNotebookPipeline(apiKey) {
  // Load current state
  const state = await loadPipelineState();
  
  // Check if already running and not stuck
  if (state.status === "running" && state.stage > 0) {
    // Check if it's been running for too long (stuck)
    const runningSince = state.lastRun ? new Date(state.lastRun) : null;
    const stuckThreshold = 30 * 60 * 1000; // 30 minutes
    
    if (runningSince && (Date.now() - runningSince.getTime()) < stuckThreshold) {
      console.log("Notebook pipeline already running");
      return { success: false, reason: "already_running" };
    }
    
    console.log("Previous pipeline run appears stuck, will resume from stage", state.stage);
  }

  // Check if we should run (normal triggers)
  const { shouldRun, reason } = await shouldRunPipeline();
  
  // Check for orphaned summaries (interrupted pipeline after stage 1)
  const hasOrphans = await hasOrphanedSummaries();
  
  if (!shouldRun && !hasOrphans && state.status !== "running") {
    return { success: true, reason: "no_trigger", ran: false };
  }

  // Determine which stage to start from
  let currentStage = 1;
  
  if (state.status === "running" && state.stage > 0) {
    // Resume from where we left off
    currentStage = state.stage;
    console.log(`Resuming pipeline from stage ${currentStage}`);
  } else if (hasOrphans && !shouldRun) {
    // We have orphaned summaries - skip to stage 2 (consolidation)
    console.log("Found orphaned summaries, starting from stage 2");
    currentStage = 2;
  } else {
    console.log(`Starting Notebook pipeline: ${reason || "orphaned summaries found"}`);
  }

  // Mark as running with current stage
  await savePipelineState({ 
    status: "running", 
    stage: currentStage,
    lastRun: new Date().toISOString(),
    lastError: null
  });

  try {
    // Stage 1: Summarize chats (skip if resuming from later stage)
    if (currentStage <= 1) {
      console.log("Stage 1: Summarizing chats...");
      await savePipelineState({ status: "running", stage: 1, lastRun: new Date().toISOString() });
      
      const stage1Result = await stage1Summarize(apiKey);
      
      if (!stage1Result.success) {
        throw new Error(`Stage 1 failed: ${stage1Result.error}`);
      }
      
      // Move to stage 2
      currentStage = 2;
      await savePipelineState({ status: "running", stage: 2, lastRun: new Date().toISOString() });
    }

    // Stage 2: Consolidate into Notebook
    if (currentStage <= 2) {
      console.log("Stage 2: Consolidating Notebook...");
      
      const stage2Result = await stage2Consolidate(apiKey);
      
      if (!stage2Result.success) {
        throw new Error(`Stage 2 failed: ${stage2Result.error}`);
      }
      
      // If no changes needed, we can skip to completion
      if (stage2Result.noChange) {
        console.log("No new summaries to consolidate, completing pipeline");
        await savePipelineState({
          status: "completed",
          stage: 0,
          lastRun: new Date().toISOString(),
          lastError: null
        });
        
        return {
          success: true,
          ran: true,
          notebookUpdated: false,
          reason: "no_new_summaries"
        };
      }
      
      // Store the new notebook for stage 3
      // We need to pass it through state since we're async
      await localforage.setItem("notebook_pipeline_pending", stage2Result.newNotebook);
      
      // Move to stage 3
      currentStage = 3;
      await savePipelineState({ status: "running", stage: 3, lastRun: new Date().toISOString() });
    }

    // Stage 3: Atomic swap
    if (currentStage <= 3) {
      console.log("Stage 3: Atomic swap...");
      
      // Retrieve the pending notebook (either from stage 2 or from storage if resuming)
      let newNotebook = await localforage.getItem("notebook_pipeline_pending");
      
      if (!newNotebook) {
        // Try to get summaries and create notebook if resuming from stage 3
        const summaries = await getSummariesForNotebook();
        if (summaries.length > 0) {
          console.log("Regenerating notebook for stage 3 resumption...");
          const stage2Result = await stage2Consolidate(apiKey);
          if (stage2Result.success) {
            newNotebook = stage2Result.newNotebook;
          }
        }
        
        if (!newNotebook) {
          throw new Error("No pending notebook found for stage 3 and could not regenerate");
        }
      }
      
      const stage3Result = await stage3AtomicSwap(newNotebook);
      
      if (!stage3Result.success) {
        throw new Error(`Stage 3 failed: ${stage3Result.error}`);
      }
      
      // Clean up pending notebook
      await localforage.removeItem("notebook_pipeline_pending");
    }

    // Mark as completed
    await savePipelineState({
      status: "completed",
      stage: 0,
      lastRun: new Date().toISOString(),
      lastError: null
    });

    console.log("Notebook pipeline completed successfully");
    return {
      success: true,
      ran: true,
      notebookUpdated: true
    };

  } catch (error) {
    console.error("Notebook pipeline failed at stage", currentStage, error);
    
    // Save error state but preserve stage for resumption
    await savePipelineState({
      status: "failed",
      stage: currentStage,
      lastRun: new Date().toISOString(),
      lastError: error.message
    });
    
    return { success: false, error: error.message, failedAtStage: currentStage };
  }
}

/**
 * Stage 1: Summarize all chats needing summary
 * Runs in parallel batches
 * 
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} Stage result
 */
async function stage1Summarize(apiKey) {
  try {
    const chats = await getChatsNeedingSummary();
    
    if (chats.length === 0) {
      return { success: true, summaryCount: 0 };
    }

    // Cap at 30 chats per run to avoid overwhelming the API
    const chatsToProcess = chats.slice(0, 30);
    
    const results = await processChatSummaries(chatsToProcess, apiKey, 5);
    
    const successCount = results.filter(r => r.success).length;
    const summaryCount = results.filter(r => r.summary && !r.nothingNotable).length;

    console.log(`Stage 1: Summarized ${successCount}/${chatsToProcess.length} chats, ${summaryCount} with notable content`);

    return { success: true, summaryCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Stage 2: Consolidate summaries into Notebook
 * Single API call with capable model
 * 
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} Stage result with newNotebook
 */
async function stage2Consolidate(apiKey) {
  try {
    const [notebook, summaries] = await Promise.all([
      loadNotebook(),
      getSummariesForNotebook()
    ]);

    if (summaries.length === 0 && notebook.metadata.updateCount > 0) {
      // No new summaries and Notebook already exists - skip consolidation
      return { success: true, newNotebook: notebook, noChange: true };
    }

    const sessionToken = await getSessionToken();

    const today = new Date().toISOString().split('T')[0];
    const lastUpdate = notebook.metadata.lastUpdated.split('T')[0];

    // Extract content without frontmatter for the AI
    const contentWithoutFrontmatter = notebook.content.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();

    const consolidationPrompt = `You are maintaining a personal Notebook about a user you talk to regularly.

CURRENT NOTEBOOK CONTENT:
${contentWithoutFrontmatter}

NEW SUMMARIES TO INCORPORATE:
${summaries.map(s => `
[${new Date(s.lastSummarizedAt).toLocaleDateString()} - "${s.title}"]
${s.summary}
`).join('\n')}

TODAY'S DATE: ${today}
LAST NOTEBOOK UPDATE: ${lastUpdate}

YOUR TASK:
Produce updated Notebook CONTENT (no frontmatter needed) that integrates the new summaries into the existing biography.

STRUCTURE:
1. First half: Holistic narrative about the user (personality, communication style, patterns, preferences, ongoing projects)
   - Write in natural paragraphs, NOT bullet points
   - The AI should feel like it's writing notes about someone it knows
   - Can include observations, evaluations, even opinions about the user
   - Be warm and human but accurate

2. Second half: Temporal zone with recent activity history
   - "Recent Activity" (past week or two) - detailed
   - "Past Month" - condensed highlights
   - "Earlier" - minimal notes, only things that still matter

GUIDELINES:
- Preserve unchanged sections verbatim to prevent drift
- Update anything that has changed (new projects, completed work, shifted interests)
- Demote older entries toward the back sections as they age
- Drop entries that have become irrelevant (resolved issues, one-off questions)
- Use inline dates naturally: "earlier this week", "around mid-April", "back in March"
- Keep total length around 1,500-2,000 tokens (approximately 1-2 pages)
- The Notebook should read like actual notes, not a database
- Do NOT include any frontmatter (the --- sections). Just write the content.
- Keep timelines accurate. Do not claim something happened over the past week if it only happened across one day. Do not demote unless it actually became old.
- Feel free to mention changes over time if they are important to the user's character
- Feel free to modify and experiment with the structure of the notebook, this is *your* notebook after all.
- If you do not have enough information, STATE SO. If you do not have any information of the user beyond a certain timeframe, do not make up information to fill in a section for older notes, instead simply admit that you do not have any experience with the user beyond then.

Write the updated Notebook content.`;

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-haiku", // Capable but faster model
        messages: [
          {
            role: "system",
            content: consolidationPrompt
          },
        ],
        stream: false,
        temperature: 0.2, // Low temperature for consistency
        max_tokens: 3000,
        ...(apiKey && { customApiKey: apiKey })
      })
    });

    if (!response.ok) {
      throw new Error(`Consolidation request failed: ${response.status}`);
    }

    const data = await response.json();
    const newContent = data.choices?.[0]?.message?.content?.trim();

    if (!newContent) {
      throw new Error("Empty consolidation response");
    }

    // Validate the new Notebook
    const validation = validateNotebook(newContent);
    if (!validation.valid) {
      throw new Error(`Invalid Notebook generated: ${validation.error}`);
    }

    const newNotebook = {
      content: newContent,
      metadata: {
        ...notebook.metadata,
        lastUpdated: new Date().toISOString(),
        updateCount: notebook.metadata.updateCount + 1
      }
    };

    return { success: true, newNotebook };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Stage 3: Atomic swap - write new Notebook only after validation
 * 
 * @param {Object} newNotebook - The new Notebook to save
 * @returns {Promise<Object>} Stage result
 */
async function stage3AtomicSwap(newNotebook) {
  try {
    // Check length (rough token estimate: chars / 4)
    const estimatedTokens = newNotebook.content.length / 4;
    if (estimatedTokens > 4000) {
      console.warn(`Notebook exceeds target length: ~${estimatedTokens.toFixed(0)} tokens`);
      // Could trigger a compression pass here in the future
    }

    // Build frontmatter automatically (system-managed, not AI-generated)
    const frontmatter = `---
version: 1
lastUpdated: ${new Date().toISOString().split('T')[0]}
updateCount: ${newNotebook.metadata.updateCount}
---`;

    // Combine frontmatter with AI-generated content
    const fullContent = `${frontmatter}\n\n${newNotebook.content.trim()}`;

    // Save the new Notebook with frontmatter
    const saved = await saveNotebook(fullContent, {
      ...newNotebook.metadata,
      lastConsolidatedAt: new Date().toISOString()
    });

    if (!saved) {
      throw new Error("Failed to save Notebook");
    }

    // Update "incorporated at" timestamps for all summaries
    await updateIncorporatedTimestamps();

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Updates the "incorporated at" timestamp for all chat summaries
 * so they won't be re-processed next time
 */
async function updateIncorporatedTimestamps() {
  try {
    const metadata = (await localforage.getItem("conversations_metadata")) || [];
    const now = new Date().toISOString();

    for (const conv of metadata) {
      const summaryKey = `chat_summary_${conv.id}`;
      const summary = await localforage.getItem(summaryKey);
      if (summary) {
        await localforage.setItem(summaryKey, {
          ...summary,
          incorporatedAt: now
        });
      }
    }
  } catch (error) {
    console.error("Error updating incorporated timestamps:", error);
  }
}

/**
 * Gets the current pipeline status for UI display
 * @returns {Promise<Object>} Pipeline status
 */
export async function getPipelineStatus() {
  return await loadPipelineState();
}

/**
 * Forces a pipeline run (for manual trigger)
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} Pipeline result
 */
export async function forceRunPipeline(apiKey) {
  // Reset state to allow run
  await savePipelineState({ status: "idle", lastRun: null, lastError: null });
  return runNotebookPipeline(apiKey);
}