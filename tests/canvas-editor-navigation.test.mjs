import test from 'node:test';
import assert from 'node:assert/strict';
import {registerUnsavedNavigation,requestAppNavigation} from '../lib/unsaved-navigation.ts';

test('closing the top editor restores the parent navigation guard with one prompt per navigation',()=>{
  const prompts=[],navigations=[];
  const removeParent=registerUnsavedNavigation(action=>{prompts.push('parent');action();});
  const removeEditor=registerUnsavedNavigation(action=>{prompts.push('editor');action();});
  try{
    requestAppNavigation(()=>navigations.push('first'));
    assert.deepEqual(prompts,['editor']);
    removeEditor();
    requestAppNavigation(()=>navigations.push('second'));
    assert.deepEqual(prompts,['editor','parent']);
    assert.deepEqual(navigations,['first','second']);
  }finally{removeEditor();removeParent();}
});

test('removing an older guard or repeating its cleanup does not remove the current guard',()=>{
  const prompts=[];
  const removeParent=registerUnsavedNavigation(()=>prompts.push('parent'));
  const removeEditor=registerUnsavedNavigation(()=>prompts.push('editor'));
  try{
    removeParent();removeParent();
    requestAppNavigation(()=>prompts.push('navigated'));
    assert.deepEqual(prompts,['editor']);
    removeEditor();removeEditor();
    requestAppNavigation(()=>prompts.push('navigated'));
    assert.deepEqual(prompts,['editor','navigated']);
  }finally{removeEditor();removeParent();}
});

test('separate registrations of the same handler have independent cleanup',()=>{
  const prompts=[],handler=()=>prompts.push('blocked');
  const removeFirst=registerUnsavedNavigation(handler),removeSecond=registerUnsavedNavigation(handler);
  try{
    removeFirst();removeFirst();
    requestAppNavigation(()=>prompts.push('navigated'));
    assert.deepEqual(prompts,['blocked']);
  }finally{removeFirst();removeSecond();}
});
